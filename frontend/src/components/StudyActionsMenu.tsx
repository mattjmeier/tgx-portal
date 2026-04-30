import { useState } from "react";
import { Download, Ellipsis, ExternalLink, FileSpreadsheet, FolderOpen, Layers3, LoaderCircle, RotateCcw, Send, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import type { PlaneSync } from "../api/studies";
import { collaborationPath, studyWorkspacePath } from "../lib/routes";
import { StudyDeleteDialog } from "./StudyDeleteDialog";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";

type StudyActionsMenuProps = {
  studyId: number;
  studyTitle: string;
  collaborationId: number;
  onDownloadConfig?: () => void;
  onDownloadGeoCsv?: () => void;
  canDownloadGeoCsv?: boolean;
  onDeleteStudy?: (studyId: number) => void;
  isDeletingStudy?: boolean;
  planeSync?: PlaneSync | null;
  canSyncToPlane?: boolean;
  isSyncingToPlane?: boolean;
  onSyncToPlane?: (studyId: number) => void;
  showOpenStudy?: boolean;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerVariant?: "ghost" | "outline";
};

export function StudyActionsMenu({
  collaborationId,
  isDeletingStudy = false,
  canDownloadGeoCsv = true,
  onDeleteStudy,
  onDownloadConfig,
  onDownloadGeoCsv,
  canSyncToPlane = false,
  isSyncingToPlane = false,
  onSyncToPlane,
  planeSync,
  showOpenStudy = true,
  studyId,
  studyTitle,
  triggerClassName,
  triggerLabel,
  triggerVariant = "ghost",
}: StudyActionsMenuProps) {
  const accessibleLabel = triggerLabel ?? `Study actions for ${studyTitle}`;
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const planeSyncStatus = planeSync?.status;
  const hasPlaneAction = canSyncToPlane && (Boolean(onSyncToPlane) || Boolean(planeSync?.plane_work_item_url));
  const isPlanePending = isSyncingToPlane || planeSyncStatus === "pending";
  const planeActionLabel =
    planeSyncStatus === "succeeded" && planeSync?.plane_work_item_url
      ? "Open in Plane"
      : isPlanePending
        ? "Sending to Plane..."
        : planeSyncStatus === "failed"
          ? "Retry Plane sync"
          : "Send to Plane";

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={accessibleLabel}
            className={triggerClassName}
            size="icon"
            type="button"
            variant={triggerVariant}
            onClick={() => {
              if (typeof window !== "undefined" && !("PointerEvent" in window)) {
                setOpen((current) => !current);
              }
            }}
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-[13.5rem] rounded-lg border-sidebar-border bg-sidebar p-1 text-sidebar-foreground shadow-lg"
        >
          {showOpenStudy ? (
            <DropdownMenuItem asChild className="rounded-md px-2.5 py-2 focus:bg-sidebar-accent focus:text-sidebar-accent-foreground">
              <Link to={studyWorkspacePath(studyId)}>
                <FolderOpen data-icon="inline-start" />
                Open study
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild className="rounded-md px-2.5 py-2 focus:bg-sidebar-accent focus:text-sidebar-accent-foreground">
            <Link to={collaborationPath(collaborationId)}>
              <Layers3 data-icon="inline-start" />
              Open collaboration
            </Link>
          </DropdownMenuItem>
          {onDownloadConfig ? (
            <DropdownMenuItem
              className="rounded-md px-2.5 py-2 focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
              onSelect={(event) => {
                event.preventDefault();
                onDownloadConfig();
              }}
            >
              <Download data-icon="inline-start" />
              Download config bundle
            </DropdownMenuItem>
          ) : null}
          {onDownloadGeoCsv ? (
            <DropdownMenuItem
              className="rounded-md px-2.5 py-2 focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
              disabled={!canDownloadGeoCsv}
              onSelect={(event) => {
                event.preventDefault();
                if (canDownloadGeoCsv) {
                  onDownloadGeoCsv();
                }
              }}
            >
              <FileSpreadsheet data-icon="inline-start" />
              Download GEO CSV
            </DropdownMenuItem>
          ) : null}
          {hasPlaneAction ? (
            <>
              <DropdownMenuSeparator className="bg-sidebar-border/70" />
              {planeSyncStatus === "succeeded" && planeSync?.plane_work_item_url ? (
                <DropdownMenuItem asChild className="rounded-md px-2.5 py-2 focus:bg-sidebar-accent focus:text-sidebar-accent-foreground">
                  <a href={planeSync.plane_work_item_url} rel="noreferrer" target="_blank">
                    <ExternalLink data-icon="inline-start" />
                    {planeActionLabel}
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
                  disabled={isPlanePending || !onSyncToPlane}
                  onSelect={(event) => {
                    event.preventDefault();
                    if (!isPlanePending && onSyncToPlane) {
                      onSyncToPlane(studyId);
                    }
                  }}
                >
                  {isPlanePending ? (
                    <LoaderCircle data-icon="inline-start" />
                  ) : planeSyncStatus === "failed" ? (
                    <RotateCcw data-icon="inline-start" />
                  ) : (
                    <Send data-icon="inline-start" />
                  )}
                  {planeActionLabel}
                </DropdownMenuItem>
              )}
            </>
          ) : null}
          {onDeleteStudy ? <DropdownMenuSeparator className="bg-sidebar-border/70" /> : null}
          {onDeleteStudy ? (
            <DropdownMenuItem
              className="rounded-md px-2.5 py-2 text-destructive focus:bg-destructive/15 focus:text-destructive"
              onSelect={(event) => {
                event.preventDefault();
                setOpen(false);
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 data-icon="inline-start" />
              Delete study
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {onDeleteStudy ? (
        <StudyDeleteDialog
          isDeleting={isDeletingStudy}
          open={deleteDialogOpen}
          studyId={studyId}
          studyTitle={studyTitle}
          onConfirmDelete={onDeleteStudy}
          onOpenChange={setDeleteDialogOpen}
        />
      ) : null}
    </>
  );
}
