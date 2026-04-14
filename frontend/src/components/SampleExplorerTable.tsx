import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { Sample } from "../api/samples";
import { cn } from "../lib/utils";
import { WorkspaceSectionCard } from "./WorkspaceSectionCard";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type SampleExplorerTableProps = {
  samples: Sample[];
  totalCount: number;
  isLoading: boolean;
  pagination: PaginationState;
  sorting: SortingState;
  search: string;
  selectedSampleId: number | null;
  onPaginationChange: (pagination: PaginationState) => void;
  onSortingChange: (sorting: SortingState) => void;
  onSearchChange: (search: string) => void;
  onSelectSample: (sample: Sample) => void;
};

function getMetadataValue(sample: Sample, key: string): string {
  const value = sample.metadata?.[key];
  if (value === undefined || value === null || value === "") {
    return "—";
  }
  return String(value);
}

const columns: ColumnDef<Sample>[] = [
  {
    accessorKey: "sample_ID",
    header: "Sample ID",
    cell: (info) => info.getValue(),
  },
  {
    accessorKey: "sample_name",
    header: "Sample name",
    cell: (info) => info.getValue(),
  },
  {
    id: "group",
    header: "Group",
    cell: ({ row }) => getMetadataValue(row.original, "group"),
  },
  {
    id: "dose",
    header: "Dose",
    cell: ({ row }) => getMetadataValue(row.original, "dose"),
  },
  {
    id: "controls",
    header: "Controls",
    cell: ({ row }) => {
      const sample = row.original;
      const flags = [
        sample.technical_control ? "Technical" : null,
        sample.reference_rna ? "Reference RNA" : null,
        sample.solvent_control ? "Solvent" : null,
      ].filter(Boolean);
      return flags.length > 0 ? flags.join(", ") : "None";
    },
  },
];

export function SampleExplorerTable({
  samples,
  totalCount,
  isLoading,
  pagination,
  sorting,
  search,
  selectedSampleId,
  onPaginationChange,
  onSortingChange,
  onSearchChange,
  onSelectSample,
}: SampleExplorerTableProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
  const firstRow = totalCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const lastRow = Math.min(totalCount, (pagination.pageIndex + 1) * pagination.pageSize);

  const table = useReactTable({
    data: samples,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: totalCount,
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: (updater) => {
      const nextPagination = typeof updater === "function" ? updater(pagination) : updater;
      onPaginationChange(nextPagination);
    },
    onSortingChange: (updater) => {
      const nextSorting = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(nextSorting);
    },
  });

  return (
    <WorkspaceSectionCard
      contentClassName="flex flex-col gap-5"
      eyebrow="Explorer"
      title="Sample explorer"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="sample-search">Search</Label>
          <Input
            id="sample-search"
            placeholder="Search sample ID, name, group, or chemical"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sample-page-size">Rows per page</Label>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(value) =>
              onPaginationChange({
                pageIndex: 0,
                pageSize: Number(value),
              })
            }
          >
            <SelectTrigger id="sample-page-size" aria-label="Rows per page" className="w-full min-w-[140px] xl:w-[140px]">
              <SelectValue placeholder="Rows per page" />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 50].map((pageSizeOption) => (
                <SelectItem key={pageSizeOption} value={String(pageSizeOption)}>
                  {pageSizeOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          {totalCount} sample record{totalCount === 1 ? "" : "s"} in this study
        </p>
        <p>
          Showing {firstRow}-{lastRow} of {totalCount}
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="hover:bg-transparent" key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortState = header.column.getIsSorted();
                  return (
                    <TableHead className="text-foreground" key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          className="inline-flex items-center gap-2 text-left hover:text-foreground"
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="text-xs text-muted-foreground">{sortState === "asc" ? "↑" : sortState === "desc" ? "↓" : "↕"}</span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={columns.length}>Loading samples...</TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={columns.length}>No samples match the current view.</TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  className={cn(
                    "cursor-pointer",
                    row.original.id === selectedSampleId ? "bg-muted hover:bg-muted" : "hover:bg-muted/40",
                  )}
                  data-state={row.original.id === selectedSampleId ? "selected" : undefined}
                  key={row.id}
                  onClick={() => onSelectSample(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          disabled={pagination.pageIndex === 0}
          type="button"
          variant="outline"
          onClick={() => table.previousPage()}
        >
          <ChevronLeft data-icon="inline-start" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {pagination.pageIndex + 1} of {pageCount}
        </span>
        <Button
          disabled={pagination.pageIndex + 1 >= pageCount}
          type="button"
          variant="outline"
          onClick={() => table.nextPage()}
        >
          Next
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </WorkspaceSectionCard>
  );
}
