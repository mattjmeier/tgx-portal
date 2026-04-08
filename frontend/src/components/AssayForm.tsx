import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createAssay, type CreateAssayPayload } from "../api/assays";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type AssayFormProps = {
  sampleId: number;
  studyId: number;
};

const initialFormState: Omit<CreateAssayPayload, "sample"> = {
  platform: "rna_seq",
  genome_version: "",
  quantification_method: "",
};

export function AssayForm({ sampleId, studyId }: AssayFormProps) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<Omit<CreateAssayPayload, "sample">>(initialFormState);
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
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="assay-platform">Platform</Label>
          <Select
            value={formState.platform}
            onValueChange={(value) =>
              setFormState((current) => ({
                ...current,
                platform: value as CreateAssayPayload["platform"],
              }))
            }
          >
            <SelectTrigger id="assay-platform" aria-label="Platform">
              <SelectValue placeholder="Select a platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rna_seq">RNA-Seq</SelectItem>
              <SelectItem value="tempo_seq">TempO-Seq</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="assay-genome-version">Genome version</Label>
          <Input
            id="assay-genome-version"
            required
            value={formState.genome_version}
            onChange={(event) => setFormState((current) => ({ ...current, genome_version: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="assay-quantification-method">Quantification method</Label>
          <Input
            id="assay-quantification-method"
            required
            value={formState.quantification_method}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                quantification_method: event.target.value,
              }))
            }
          />
        </div>
      </div>
      <Button disabled={mutation.isPending} type="submit" variant="secondary">
        {mutation.isPending ? "Adding..." : "Add assay"}
      </Button>
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
    </form>
  );
}
