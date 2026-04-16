import { useId, useMemo, useState } from "react";

import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type ProjectDeleteDialogProps = {
  projectId: number;
  projectTitle: string;
  onConfirmDelete: (projectId: number) => void;
  children?: React.ReactNode;
  isDeleting?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ProjectDeleteDialog({
  children,
  isDeleting = false,
  onConfirmDelete,
  onOpenChange,
  open,
  projectId,
  projectTitle,
}: ProjectDeleteDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [typedTitle, setTypedTitle] = useState("");
  const inputId = useId();
  const expectedTitle = useMemo(() => projectTitle.trim(), [projectTitle]);

  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;
  const setDialogOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
    if (!nextOpen) {
      setTypedTitle("");
    }
  };

  const isMatch = typedTitle.trim() === expectedTitle;

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete collaboration</DialogTitle>
          <DialogDescription>
            This action cannot be undone. To confirm deletion, type the collaboration title exactly as shown below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <p className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm text-foreground">{projectTitle}</p>
          <Label htmlFor={inputId}>Type the collaboration title</Label>
          <Input
            id={inputId}
            autoComplete="off"
            placeholder={projectTitle}
            value={typedTitle}
            onChange={(event) => setTypedTitle(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!isMatch || isDeleting}
            type="button"
            variant="destructive"
            onClick={() => {
              onConfirmDelete(projectId);
              setDialogOpen(false);
            }}
          >
            Delete collaboration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
