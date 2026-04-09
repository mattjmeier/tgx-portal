import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { createStudy, type CreateStudyPayload, type Study } from "../api/studies";
import { collaborationPath, studyWorkspacePath } from "../lib/routes";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type StudyFormProps = {
  projectId: number;
  projectTitle?: string;
};

const initialFormState: Omit<CreateStudyPayload, "project"> = {
  title: "",
  species: "human",
  celltype: "",
  treatment_var: "",
  batch_var: "",
};

export function StudyForm({ projectId, projectTitle }: StudyFormProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formState, setFormState] = useState<Omit<CreateStudyPayload, "project">>(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation<Study, Error, CreateStudyPayload>({
    mutationFn: (payload: CreateStudyPayload) => createStudy(payload),
    onSuccess: (createdStudy) => {
      setFormState(initialFormState);
      setErrorMessage(null);
      void queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      navigate(`${studyWorkspacePath(createdStudy.id)}?intake=open`, {
        replace: true,
        state: {
          flash: {
            variant: "success",
            title: "Study created",
            description: projectTitle
              ? `"${createdStudy.title}" is ready under ${projectTitle}. Start sample intake in the workspace.`
              : `"${createdStudy.title}" is ready. Start sample intake in the workspace.`,
            action: {
              label: "Back to collaboration",
              to: collaborationPath(createdStudy.project),
            },
          },
        },
      });
    },
    onError: (error) => {
      setErrorMessage(error.message);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    mutation.mutate({
      project: projectId,
      ...formState,
    });
  }

  return (
    <form className="detail-form" onSubmit={handleSubmit}>
      <h3>Create a study</h3>
      <div className="grid gap-2">
        <Label htmlFor="study-title">Study title</Label>
        <Input
          id="study-title"
          required
          value={formState.title}
          onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="study-species">Species</Label>
          <Select
            value={formState.species}
            onValueChange={(value) => setFormState((current) => ({ ...current, species: value as CreateStudyPayload["species"] }))}
          >
            <SelectTrigger id="study-species" aria-label="Species">
              <SelectValue placeholder="Select a species" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="human">Human</SelectItem>
              <SelectItem value="mouse">Mouse</SelectItem>
              <SelectItem value="rat">Rat</SelectItem>
              <SelectItem value="hamster">Hamster</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="study-celltype">Cell type</Label>
          <Input
            id="study-celltype"
            required
            value={formState.celltype}
            onChange={(event) => setFormState((current) => ({ ...current, celltype: event.target.value }))}
          />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="study-treatment-var">Treatment variable</Label>
          <Input
            id="study-treatment-var"
            required
            value={formState.treatment_var}
            onChange={(event) => setFormState((current) => ({ ...current, treatment_var: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="study-batch-var">Batch variable</Label>
          <Input
            id="study-batch-var"
            required
            value={formState.batch_var}
            onChange={(event) => setFormState((current) => ({ ...current, batch_var: event.target.value }))}
          />
        </div>
      </div>
      <Button disabled={mutation.isPending} type="submit">
        {mutation.isPending ? "Creating..." : "Create study"}
      </Button>
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
    </form>
  );
}
