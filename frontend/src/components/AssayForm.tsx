import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createAssay, type CreateAssayPayload } from "../api/assays";

type AssayFormProps = {
  sampleId: number;
  studyId: number;
};

const initialFormState = {
  platform: "rna_seq",
  genome_version: "",
  quantification_method: "",
} satisfies Omit<CreateAssayPayload, "sample">;

export function AssayForm({ sampleId, studyId }: AssayFormProps) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation<Awaited<ReturnType<typeof createAssay>>, Error, CreateAssayPayload>({
    mutationFn: createAssay,
    onSuccess: async () => {
      setFormState(initialFormState);
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["assays", studyId] });
    },
    onError: (error) => {
      setErrorMessage(error.message);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    mutation.mutate({
      sample: sampleId,
      ...formState,
    });
  }

  return (
    <form className="assay-form" onSubmit={handleSubmit}>
      <label>
        Platform
        <select
          value={formState.platform}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              platform: event.target.value as CreateAssayPayload["platform"],
            }))
          }
        >
          <option value="rna_seq">RNA-Seq</option>
          <option value="tempo_seq">TempO-Seq</option>
        </select>
      </label>
      <label>
        Genome version
        <input
          required
          value={formState.genome_version}
          onChange={(event) => setFormState((current) => ({ ...current, genome_version: event.target.value }))}
        />
      </label>
      <label>
        Quantification method
        <input
          required
          value={formState.quantification_method}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              quantification_method: event.target.value,
            }))
          }
        />
      </label>
      <button className="secondary-button" disabled={mutation.isPending} type="submit">
        {mutation.isPending ? "Adding..." : "Add assay"}
      </button>
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
    </form>
  );
}
