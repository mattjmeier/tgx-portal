import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaginationState } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { deleteStudy, fetchStudiesIndex, type Study } from "../api/studies";
import { collaborationPath, globalStudyCreateRoute, studyWorkspacePath } from "../lib/routes";
import { StudiesTable } from "./StudiesTable";
import { WorkspaceSectionCard } from "./WorkspaceSectionCard";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

function getStudyOrderingParam(titleSort: "asc" | "desc"): string {
  const grouping = "project__title";
  return `${grouping},${titleSort === "desc" ? "-" : ""}title`;
}

export function StudyIndexPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [titleSort, setTitleSort] = useState<"asc" | "desc">("asc");

  const ordering = getStudyOrderingParam(titleSort);
  const query = useQuery({
    queryKey: ["studies", pagination.pageIndex, pagination.pageSize, ordering, search],
    queryFn: () =>
      fetchStudiesIndex({
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        ordering,
        search: search.trim() ? search.trim() : undefined,
      }),
  });

  const studies = query.data?.results ?? [];
  const totalCount = query.data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
  const firstRow = totalCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const lastRow = Math.min(totalCount, (pagination.pageIndex + 1) * pagination.pageSize);

  const deleteStudyMutation = useMutation<void, Error, number>({
    mutationFn: deleteStudy,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["studies"] });
    },
  });

  function handleDeleteStudy(study: Study) {
    const confirmed = window.confirm(`Delete the study "${study.title}"?`);
    if (!confirmed) {
      return;
    }

    deleteStudyMutation.mutate(study.id);
  }

  return (
    <WorkspaceSectionCard
      action={
        <Button asChild>
          <Link to={globalStudyCreateRoute}>New study</Link>
        </Button>
      }
      contentClassName="flex flex-col gap-4"
      description="Studies are grouped by collaboration, with the study title as the primary label."
      eyebrow="Directory"
      title="Studies"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="w-full md:max-w-md">
          <Label htmlFor="study-search">Search</Label>
          <Input
            id="study-search"
            placeholder="Search by study title, cell line, or collaboration"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPagination((prev) => ({ ...prev, pageIndex: 0 }));
            }}
          />
        </div>

        <div className="flex items-end gap-3">
          <div>
            <Label htmlFor="study-page-size">Rows per page</Label>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) =>
                setPagination({
                  pageIndex: 0,
                  pageSize: Number(value),
                })
              }
            >
              <SelectTrigger id="study-page-size" aria-label="Rows per page" className="w-[160px]">
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
          {totalCount} study record{totalCount === 1 ? "" : "s"}
        </p>
        <p>
          Showing {firstRow}-{lastRow} of {totalCount}
        </p>
      </div>

      <StudiesTable
        studies={studies}
        isLoading={query.isLoading}
        isError={query.isError}
        emptyMessage="No studies match the current view."
        showProjectGroups
        titleSortState={titleSort}
        onToggleTitleSort={() => {
          setTitleSort((current) => (current === "asc" ? "desc" : "asc"));
          setPagination((prev) => ({ ...prev, pageIndex: 0 }));
        }}
        renderStudyTitle={(study) => (
          <div className="flex min-w-0 flex-col">
            <Link className="truncate font-medium text-primary hover:underline" to={studyWorkspacePath(study.id)}>
              {study.title}
            </Link>
            <span className="truncate text-sm text-muted-foreground">
              {study.species && study.celltype ? `${study.species} · ${study.celltype}` : "Draft metadata pending"}
            </span>
          </div>
        )}
        renderGroupTitle={(study) => (
          <Link className="text-sm font-semibold text-foreground underline-offset-2 hover:underline" to={collaborationPath(study.project)}>
            {study.project_title}
          </Link>
        )}
        renderStudyActions={(study) => (
          <div className="flex items-center gap-2">
            <Button asChild size="icon" variant="outline">
              <Link aria-label={`Edit study ${study.title}`} to={`${studyWorkspacePath(study.id)}?tab=collaboration`}>
                <Pencil />
              </Link>
            </Button>
            <Button
              aria-label={`Delete study ${study.title}`}
              size="icon"
              type="button"
              variant="destructive"
              onClick={() => handleDeleteStudy(study)}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      />
      {deleteStudyMutation.isError ? <p className="text-sm text-destructive">{deleteStudyMutation.error.message}</p> : null}

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
            onClick={() =>
              setPagination((current) => ({
                ...current,
                pageIndex: Math.max(0, current.pageIndex - 1),
              }))
            }
          >
            <ChevronLeft data-icon="inline-start" />
            Previous
          </Button>
          <Button
            aria-label="Next page"
            disabled={pagination.pageIndex + 1 >= pageCount}
            type="button"
            variant="outline"
            onClick={() =>
              setPagination((current) => ({
                ...current,
                pageIndex: Math.min(pageCount - 1, current.pageIndex + 1),
              }))
            }
          >
            Next
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </WorkspaceSectionCard>
  );
}
