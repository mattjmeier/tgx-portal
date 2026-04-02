import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createStudy, type CreateStudyPayload } from "../api/studies";

type StudyFormProps = {
  projectId: number;
};

const initialFormState = {
  species: "human",
  celltype: "",
  treatment_var: "",
  batch_var: "",
} satisfies Omit<CreateStudyPayload, "project">;

export function StudyForm({ projectId }: StudyFormProps) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation<Awaited<ReturnType<typeof createStudy>>, Error, CreateStudyPayload>({
    mutationFn: (payload: CreateStudyPayload) => createStudy(payload),
    onSuccess: () => {
      setFormState(initialFormState);
      setErrorMessage(null);
      void queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
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
      <label>
        Species
        <select
          value={formState.species}
          onChange={(event) => setFormState((current) => ({ ...current, species: event.target.value as CreateStudyPayload["species"] }))}
        >
          <option value="human">Human</option>
          <option value="mouse">Mouse</option>
          <option value="rat">Rat</option>
          <option value="hamster">Hamster</option>
        </select>
      </label>
      <label>
        Cell type
        <input
          required
          value={formState.celltype}
          onChange={(event) => setFormState((current) => ({ ...current, celltype: event.target.value }))}
        />
      </label>
      <label>
        Treatment variable
        <input
          required
          value={formState.treatment_var}
          onChange={(event) => setFormState((current) => ({ ...current, treatment_var: event.target.value }))}
        />
      </label>
      <label>
        Batch variable
        <input
          required
          value={formState.batch_var}
          onChange={(event) => setFormState((current) => ({ ...current, batch_var: event.target.value }))}
        />
      </label>
      <button className="primary-button" disabled={mutation.isPending} type="submit">
        {mutation.isPending ? "Creating..." : "Create study"}
      </button>
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
    </form>
  );
}
