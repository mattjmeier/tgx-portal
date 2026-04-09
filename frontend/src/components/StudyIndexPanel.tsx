import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PaginationState } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { fetchStudiesIndex } from "../api/studies";
import { collaborationPath, globalStudyCreateRoute, studyWorkspacePath } from "../lib/routes";
import { StudiesTable } from "./StudiesTable";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

function getStudyOrderingParam(titleSort: "asc" | "desc"): string {
  const grouping = "project__title";
  return `${grouping},${titleSort === "desc" ? "-" : ""}title`;
}

export function StudyIndexPanel() {
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

  return (
    <section className="rounded-lg border border-border bg-background px-6 py-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Directory</p>
          <h2 className="text-xl font-semibold">Studies</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Studies are grouped by collaboration, with the study title as the primary label.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link to={globalStudyCreateRoute}>New study</Link>
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
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
                {[5, 10, 20, 50].map((pageSizeOption) => (
                  <SelectItem key={pageSizeOption} value={String(pageSizeOption)}>
                    {pageSizeOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
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
              {study.species} · {study.celltype}
            </span>
          </div>
        )}
        renderStudyActions={(study) => (
          <Button asChild size="sm" variant="outline">
            <Link to={studyWorkspacePath(study.id)}>Open</Link>
          </Button>
        )}
        renderGroupAction={(study) => (
          <Button asChild size="sm" variant="ghost">
            <Link to={collaborationPath(study.project)}>Open collaboration</Link>
          </Button>
        )}
      />

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
            <ChevronLeft />
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
            <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
