import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createProject, type CreateProjectPayload } from "../api/projects";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

const initialFormState: CreateProjectPayload = {
  pi_name: "",
  researcher_name: "",
  bioinformatician_assigned: "",
  title: "",
  description: "",
};

export function ProjectForm() {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<CreateProjectPayload>(initialFormState);

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      setFormState(initialFormState);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(formState);
  }

  return (
    <form className="project-form" onSubmit={handleSubmit}>
      <h2>Create a collaboration</h2>
      <div className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="project-title">Collaboration title</Label>
          <Input
            id="project-title"
          required
          value={formState.title}
          onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="project-pi">PI name</Label>
            <Input
              id="project-pi"
              required
              value={formState.pi_name}
              onChange={(event) => setFormState((current) => ({ ...current, pi_name: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-researcher">Researcher name</Label>
            <Input
              id="project-researcher"
              required
              value={formState.researcher_name}
              onChange={(event) => setFormState((current) => ({ ...current, researcher_name: event.target.value }))}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="project-bioinformatics">Bioinformatician assigned</Label>
          <Input
            id="project-bioinformatics"
            required
            value={formState.bioinformatician_assigned}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                bioinformatician_assigned: event.target.value,
              }))
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="project-description">Description</Label>
          <Textarea
            id="project-description"
            rows={4}
            value={formState.description}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </div>
      </div>
      <Button disabled={mutation.isPending} type="submit">
        {mutation.isPending ? "Creating..." : "Create collaboration"}
      </Button>
      {mutation.isError ? <p className="error-text">Unable to create the collaboration right now.</p> : null}
    </form>
  );
}
