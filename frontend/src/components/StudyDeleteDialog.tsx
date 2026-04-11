import { useId, useMemo, useState } from "react";

import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type StudyDeleteDialogProps = {
  studyId: number;
  studyTitle: string;
  onConfirmDelete: (studyId: number) => void;
  children?: React.ReactNode;
  isDeleting?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function StudyDeleteDialog({
  children,
  isDeleting = false,
  onConfirmDelete,
  onOpenChange,
  open,
  studyId,
  studyTitle,
}: StudyDeleteDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [typedTitle, setTypedTitle] = useState("");
  const inputId = useId();
  const expectedTitle = useMemo(() => studyTitle.trim(), [studyTitle]);

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
          <DialogTitle>Delete study</DialogTitle>
          <DialogDescription>
            This action cannot be undone. To confirm deletion, type the study title exactly as shown below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <p className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm text-foreground">{studyTitle}</p>
          <Label htmlFor={inputId}>Type the study title</Label>
          <Input
            id={inputId}
            autoComplete="off"
            placeholder={studyTitle}
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
              onConfirmDelete(studyId);
              setDialogOpen(false);
            }}
          >
            Delete study
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
