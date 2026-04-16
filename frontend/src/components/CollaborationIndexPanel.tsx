import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { deleteProject, fetchProjects, type Project } from "../api/projects";
import { collaborationCreatePath, collaborationPath } from "../lib/routes";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";
import { WorkspaceSectionCard } from "./WorkspaceSectionCard";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const orderingFieldByColumnId: Record<string, string> = {
  title: "title",
  pi_name: "pi_name",
  researcher_name: "researcher_name",
  owner: "owner__username",
  bioinformatician_assigned: "bioinformatician_assigned",
  created_at: "created_at",
};

function getOrderingParam(sorting: SortingState): string {
  if (sorting.length === 0) {
    return "-created_at";
  }

  const active = sorting[0];
  const field = orderingFieldByColumnId[active.id] ?? active.id;
  return `${active.desc ? "-" : ""}${field}`;
}

function SortIndicator({ state }: { state: false | "asc" | "desc" }) {
  return <span aria-hidden className="ml-1 text-xs text-muted-foreground">{state === "asc" ? "↑" : state === "desc" ? "↓" : "↕"}</span>;
}

export function CollaborationIndexPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([]);

  const ordering = useMemo(() => getOrderingParam(sorting), [sorting]);
  const query = useQuery({
    queryKey: ["projects", pagination.pageIndex, pagination.pageSize, ordering, search],
    queryFn: () =>
      fetchProjects({
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        ordering,
        search: search.trim() ? search.trim() : undefined,
      }),
  });

  const projects = query.data?.results ?? [];
  const totalCount = query.data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
  const firstRow = totalCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const lastRow = Math.min(totalCount, (pagination.pageIndex + 1) * pagination.pageSize);

  const deleteProjectMutation = useMutation<void, Error, number>({
    mutationFn: deleteProject,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project"] }),
        queryClient.invalidateQueries({ queryKey: ["studies"] }),
        queryClient.invalidateQueries({ queryKey: ["studies-index"] }),
        queryClient.invalidateQueries({ queryKey: ["study"] }),
      ]);
    },
  });

  const columns = useMemo<ColumnDef<Project>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Collaboration",
        cell: ({ row }) => {
          const project = row.original;
          return (
            <div className="flex min-w-0 flex-col">
              <Link className="truncate font-medium text-primary hover:underline" to={collaborationPath(project.id)}>
                {project.title}
              </Link>
              <span className="max-w-xl whitespace-normal break-words text-sm text-muted-foreground">
                {project.description || "No description yet."}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "pi_name",
        header: "PI",
        cell: (info) => info.getValue(),
      },
      {
        accessorKey: "researcher_name",
        header: "Researcher",
        cell: (info) => info.getValue(),
      },
      {
        accessorKey: "owner",
        header: "Owner",
        cell: (info) => info.getValue() || "Unassigned",
      },
      {
        accessorKey: "bioinformatician_assigned",
        header: "Bioinformatics",
        cell: (info) => info.getValue(),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to={collaborationPath(row.original.id)}>Open</Link>
            </Button>
            <ProjectDeleteDialog
              isDeleting={deleteProjectMutation.isPending && deleteProjectMutation.variables === row.original.id}
              projectId={row.original.id}
              projectTitle={row.original.title}
              onConfirmDelete={deleteProjectMutation.mutate}
            >
              <Button aria-label={`Delete collaboration ${row.original.title}`} size="icon" type="button" variant="destructive">
                <Trash2 />
              </Button>
            </ProjectDeleteDialog>
          </div>
        ),
      },
    ],
    [deleteProjectMutation.isPending, deleteProjectMutation.mutate, deleteProjectMutation.variables],
  );

  const table = useReactTable({
    data: projects,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: totalCount,
    state: { pagination, sorting },
    onPaginationChange: (updater) => {
      const nextPagination = typeof updater === "function" ? updater(pagination) : updater;
      setPagination(nextPagination);
    },
    onSortingChange: (updater) => {
      const nextSorting = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(nextSorting);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
  });

  return (
    <WorkspaceSectionCard
      action={
        <Button asChild>
          <Link to={collaborationCreatePath}>New collaboration</Link>
        </Button>
      }
      contentClassName="flex flex-col gap-4"
      description="This table shows your current collaborations."
      eyebrow="Registry"
      title="Collaborations"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="w-full md:max-w-md">
          <Label htmlFor="collaboration-search">Search</Label>
          <Input
            id="collaboration-search"
            placeholder="Search by title, PI, researcher, or description"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPagination((prev) => ({ ...prev, pageIndex: 0 }));
            }}
          />
        </div>

        <div className="flex items-end gap-3">
          <div>
            <Label htmlFor="collaboration-page-size">Rows per page</Label>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) =>
                setPagination({
                  pageIndex: 0,
                  pageSize: Number(value),
                })
              }
            >
              <SelectTrigger id="collaboration-page-size" aria-label="Rows per page" className="w-[160px]">
                <SelectValue placeholder="Rows per page" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {[5, 10, 20, 50].map((pageSizeOption) => (
                    <SelectItem key={pageSizeOption} value={String(pageSizeOption)}>
                      {pageSizeOption}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          {totalCount} collaboration record{totalCount === 1 ? "" : "s"}
        </p>
        <p>
          Showing {firstRow}-{lastRow} of {totalCount}
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortState = header.column.getIsSorted();
                  const label = header.isPlaceholder
                    ? ""
                    : String(
                        typeof header.column.columnDef.header === "string"
                          ? header.column.columnDef.header
                          : header.column.id,
                      );

                  return (
                    <th key={header.id} className="h-12 px-4 text-left align-middle font-medium text-foreground">
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          aria-label={label}
                          className="inline-flex items-center text-left hover:text-foreground"
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIndicator state={sortState} />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {query.isLoading ? (
              <tr className="border-b border-border">
                <td className="p-4 text-muted-foreground" colSpan={columns.length}>
                  Loading collaborations...
                </td>
              </tr>
            ) : query.isError ? (
              <tr className="border-b border-border">
                <td className="p-4 text-destructive" colSpan={columns.length}>
                  The collaboration list could not be loaded.
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr className="border-b border-border">
                <td className="p-4 text-muted-foreground" colSpan={columns.length}>
                  No collaborations match the current view.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-border hover:bg-muted/40">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="p-4 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          Page {pagination.pageIndex + 1} of {pageCount}
        </p>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Previous page"
            disabled={pagination.pageIndex === 0}
            type="button"
            variant="outline"
            onClick={() => table.previousPage()}
          >
            <ChevronLeft data-icon="inline-start" />
            Previous
          </Button>
          <Button
            aria-label="Next page"
            disabled={pagination.pageIndex + 1 >= pageCount}
            type="button"
            variant="outline"
            onClick={() => table.nextPage()}
          >
            Next
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
      {deleteProjectMutation.isError ? <p className="text-sm text-destructive">{deleteProjectMutation.error.message}</p> : null}
    </WorkspaceSectionCard>
  );
}
