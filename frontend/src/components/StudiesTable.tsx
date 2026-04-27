import type { ReactNode } from "react";

import type { Study } from "../api/studies";
import { cn } from "../lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type StudySortState = false | "asc" | "desc";

type StudiesTableProps = {
  studies: Study[];
  isLoading: boolean;
  isError: boolean;
  className?: string;
  emptyMessage: string;
  loadingMessage?: string;
  errorMessage?: string;
  showProjectGroups?: boolean;
  titleSortState?: StudySortState;
  onToggleTitleSort?: () => void;
  renderStudyTitle: (study: Study) => ReactNode;
  renderStudyActions?: (study: Study) => ReactNode;
  renderGroupTitle?: (study: Study) => ReactNode;
  renderGroupAction?: (study: Study) => ReactNode;
  getRowClassName?: (study: Study) => string | undefined;
};

function SortIndicator({ state }: { state: StudySortState }) {
  return <span aria-hidden className="ml-1 text-xs text-muted-foreground">{state === "asc" ? "↑" : state === "desc" ? "↓" : "↕"}</span>;
}

export function StudiesTable({
  studies,
  isLoading,
  isError,
  className = "mt-4",
  emptyMessage,
  loadingMessage = "Loading studies...",
  errorMessage = "The study list could not be loaded.",
  showProjectGroups = false,
  titleSortState = false,
  onToggleTitleSort,
  renderStudyTitle,
  renderStudyActions,
  renderGroupTitle,
  renderGroupAction,
  getRowClassName,
}: StudiesTableProps) {
  const hasActions = Boolean(renderStudyActions);
  const visibleColCount = hasActions ? 4 : 3;

  return (
    <div className={cn("overflow-hidden rounded-md border border-border", className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-foreground">
              {onToggleTitleSort ? (
                <button
                  aria-label="Study"
                  className="inline-flex items-center text-left hover:text-foreground"
                  type="button"
                  onClick={onToggleTitleSort}
                >
                  Study
                  <SortIndicator state={titleSortState} />
                </button>
              ) : (
                "Study"
              )}
            </TableHead>
            <TableHead className="text-foreground">Samples</TableHead>
            <TableHead className="text-foreground">Processing metadata</TableHead>
            {hasActions ? <TableHead className="text-foreground">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={visibleColCount}>
                {loadingMessage}
              </TableCell>
            </TableRow>
          ) : isError ? (
            <TableRow>
              <TableCell className="text-destructive" colSpan={visibleColCount}>
                {errorMessage}
              </TableCell>
            </TableRow>
          ) : studies.length === 0 ? (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={visibleColCount}>
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            (() => {
              let lastProjectId: number | null = null;

              return studies.flatMap((study) => {
                const showGroupHeading = showProjectGroups && lastProjectId !== study.project;
                lastProjectId = study.project;

                const groupRow = showGroupHeading ? (
                  <TableRow className="bg-muted/35 hover:bg-muted/45" key={`group-${study.project}`}>
                    <TableCell colSpan={visibleColCount}>
                      <div className="flex items-center gap-2 border-l-4 border-primary/40 pl-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collaboration</span>
                        {renderGroupTitle ? (
                          renderGroupTitle(study)
                        ) : (
                          <h3 className="text-sm font-semibold text-foreground">{study.project_title}</h3>
                        )}
                        {renderGroupAction ? renderGroupAction(study) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null;

                const rowClassName = getRowClassName ? getRowClassName(study) : undefined;

                const dataRow = (
                  <TableRow className={cn("hover:bg-muted/40", rowClassName)} key={study.id}>
                    <TableCell className={showProjectGroups ? "pl-8" : undefined}>{renderStudyTitle(study)}</TableCell>
                    <TableCell className="text-sm text-foreground">{study.sample_count ?? 0}</TableCell>
                    <TableCell className="text-sm text-foreground">{study.assay_count ?? 0}</TableCell>
                    {hasActions ? <TableCell>{renderStudyActions?.(study)}</TableCell> : null}
                  </TableRow>
                );

                return groupRow ? [groupRow, dataRow] : [dataRow];
              });
            })()
          )}
        </TableBody>
      </Table>
    </div>
  );
}
