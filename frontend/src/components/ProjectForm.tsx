import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createProject, type CreateProjectPayload } from "../api/projects";

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
      <h2>Create a project</h2>
      <label>
        Project title
        <input
          required
          value={formState.title}
          onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
        />
      </label>
      <label>
        PI name
        <input
          required
          value={formState.pi_name}
          onChange={(event) => setFormState((current) => ({ ...current, pi_name: event.target.value }))}
        />
      </label>
      <label>
        Researcher name
        <input
          required
          value={formState.researcher_name}
          onChange={(event) => setFormState((current) => ({ ...current, researcher_name: event.target.value }))}
        />
      </label>
      <label>
        Bioinformatician assigned
        <input
          required
          value={formState.bioinformatician_assigned}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              bioinformatician_assigned: event.target.value,
            }))
          }
        />
      </label>
      <label>
        Description
        <textarea
          rows={4}
          value={formState.description}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </label>
      <button className="primary-button" disabled={mutation.isPending} type="submit">
        {mutation.isPending ? "Creating..." : "Create project"}
      </button>
      {mutation.isError ? <p className="error-text">Unable to create the project right now.</p> : null}
    </form>
  );
}
