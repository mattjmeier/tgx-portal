import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createAssay, type CreateAssayPayload } from "../api/assays";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type AssayFormProps = {
  onSuccess?: () => void;
  sampleId: number;
  studyId: number;
};

const initialFormState: Omit<CreateAssayPayload, "sample"> = {
  platform: "rna_seq",
  genome_version: "",
  quantification_method: "",
};

export function AssayForm({ onSuccess, sampleId, studyId }: AssayFormProps) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<Omit<CreateAssayPayload, "sample">>(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation<Awaited<ReturnType<typeof createAssay>>, Error, CreateAssayPayload>({
    mutationFn: createAssay,
    onSuccess: async () => {
      setFormState(initialFormState);
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["assays", studyId] });
      onSuccess?.();
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
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-2">
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
            <SelectTrigger id="assay-platform" aria-label="Platform" className="w-full">
              <SelectValue placeholder="Select a platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="rna_seq">RNA-Seq</SelectItem>
                <SelectItem value="tempo_seq">TempO-Seq</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="assay-genome-version">Genome version</Label>
          <Input
            id="assay-genome-version"
            placeholder="mm10"
            required
            value={formState.genome_version}
            onChange={(event) => setFormState((current) => ({ ...current, genome_version: event.target.value }))}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="assay-quantification-method">Quantification method</Label>
          <Input
            id="assay-quantification-method"
            placeholder="raw_counts"
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
      <Button className="w-full sm:w-fit" disabled={mutation.isPending} type="submit">
        {mutation.isPending ? "Applying..." : "Apply processing metadata"}
      </Button>
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
    </form>
  );
}
