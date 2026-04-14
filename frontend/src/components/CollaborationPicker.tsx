import { cn } from "../lib/utils";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type CollaborationOption = {
  id: number;
  title: string;
};

type CollaborationPickerProps = {
  isDisabled?: boolean;
  isRequired?: boolean;
  className?: string;
  projects: CollaborationOption[];
  selectedProjectId: number | null;
  onProjectChange: (projectId: number) => void;
};

export function CollaborationPicker({
  isDisabled = false,
  isRequired = false,
  className,
  projects,
  selectedProjectId,
  onProjectChange,
}: CollaborationPickerProps) {
  return (
    <section className={cn("rounded-xl border border-border/70 bg-card p-5 shadow-sm", className)}>
      <div className="grid gap-2">
        <p className="eyebrow">Collaboration selection</p>
        <h3 className="text-lg font-semibold text-foreground">Choose a collaboration first</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          Pick the collaboration that should own this study, then continue into the experiment-level form.
        </p>
      </div>

      <div className="mt-5 grid gap-2">
        <Label htmlFor="study-collaboration">Collaboration</Label>
        <Select
          disabled={isDisabled || projects.length === 0}
          value={selectedProjectId ? String(selectedProjectId) : undefined}
          onValueChange={(value) => onProjectChange(Number(value))}
        >
          <SelectTrigger
            id="study-collaboration"
            aria-label="Collaboration"
            className={cn(isRequired && "border-primary/70 ring-2 ring-primary/20")}
          >
            <SelectValue placeholder={projects.length === 0 ? "No collaborations available" : "Select a collaboration"} />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={String(project.id)}>
                {project.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isRequired ? <p className="text-xs font-medium text-primary">Choose a collaboration to continue.</p> : null}
      </div>
    </section>
  );
}
