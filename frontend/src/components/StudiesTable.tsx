import type { ReactNode } from "react";

import type { Study } from "../api/studies";

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
    <div className={`${className} overflow-hidden rounded-md border border-border`.trim()}>
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b border-border">
            <th className="h-12 px-4 text-left align-middle font-medium text-foreground">
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
            </th>
            <th className="h-12 px-4 text-left align-middle font-medium text-foreground">Samples</th>
            <th className="h-12 px-4 text-left align-middle font-medium text-foreground">Assays</th>
            {hasActions ? <th className="h-12 px-4 text-left align-middle font-medium text-foreground">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {isLoading ? (
            <tr className="border-b border-border">
              <td className="p-4 text-muted-foreground" colSpan={visibleColCount}>
                {loadingMessage}
              </td>
            </tr>
          ) : isError ? (
            <tr className="border-b border-border">
              <td className="p-4 text-destructive" colSpan={visibleColCount}>
                {errorMessage}
              </td>
            </tr>
          ) : studies.length === 0 ? (
            <tr className="border-b border-border">
              <td className="p-4 text-muted-foreground" colSpan={visibleColCount}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            (() => {
              let lastProjectId: number | null = null;

              return studies.flatMap((study) => {
                const showGroupHeading = showProjectGroups && lastProjectId !== study.project;
                lastProjectId = study.project;

                const groupRow = showGroupHeading ? (
                  <tr className="border-b border-border bg-muted/35 transition-colors hover:bg-muted/45" key={`group-${study.project}`}>
                    <td className="p-4" colSpan={visibleColCount}>
                      <div className="flex items-center gap-2 border-l-4 border-primary/40 pl-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collaboration</span>
                        {renderGroupTitle ? (
                          renderGroupTitle(study)
                        ) : (
                          <h3 className="text-sm font-semibold text-foreground">{study.project_title}</h3>
                        )}
                        {renderGroupAction ? renderGroupAction(study) : null}
                      </div>
                    </td>
                  </tr>
                ) : null;

                const rowClassName = getRowClassName ? getRowClassName(study) : undefined;
                const rowClasses = ["border-b border-border hover:bg-muted/40"];
                if (rowClassName) {
                  rowClasses.push(rowClassName);
                }

                const dataRow = (
                  <tr className={rowClasses.join(" ")} key={study.id}>
                    <td className={`p-4 align-middle ${showProjectGroups ? "pl-8" : ""}`}>{renderStudyTitle(study)}</td>
                    <td className="p-4 align-middle text-sm text-foreground">{study.sample_count ?? 0}</td>
                    <td className="p-4 align-middle text-sm text-foreground">{study.assay_count ?? 0}</td>
                    {hasActions ? <td className="p-4 align-middle">{renderStudyActions?.(study)}</td> : null}
                  </tr>
                );

                return groupRow ? [groupRow, dataRow] : [dataRow];
              });
            })()
          )}
        </tbody>
      </table>
    </div>
  );
}
