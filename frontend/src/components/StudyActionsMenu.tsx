import { useState } from "react";
import { Ellipsis, FolderOpen, Layers3, Download } from "lucide-react";
import { Link } from "react-router-dom";

import { collaborationPath, studyWorkspacePath } from "../lib/routes";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

type StudyActionsMenuProps = {
  studyId: number;
  studyTitle: string;
  collaborationId: number;
  onDownloadConfig?: () => void;
  showOpenStudy?: boolean;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerVariant?: "ghost" | "outline";
};

export function StudyActionsMenu({
  collaborationId,
  onDownloadConfig,
  showOpenStudy = true,
  studyId,
  studyTitle,
  triggerClassName,
  triggerLabel,
  triggerVariant = "ghost",
}: StudyActionsMenuProps) {
  const accessibleLabel = triggerLabel ?? `Study actions for ${studyTitle}`;
  const [open, setOpen] = useState(false);

  return (
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
      <DropdownMenuContent align="end">
        {showOpenStudy ? (
          <DropdownMenuItem asChild>
            <Link to={studyWorkspacePath(studyId)}>
              <FolderOpen data-icon="inline-start" />
              Open study
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to={collaborationPath(collaborationId)}>
            <Layers3 data-icon="inline-start" />
            Open collaboration
          </Link>
        </DropdownMenuItem>
        {onDownloadConfig ? (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onDownloadConfig();
            }}
          >
            <Download data-icon="inline-start" />
            Download config bundle
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
