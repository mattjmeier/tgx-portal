import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createSample, type CreateSamplePayload } from "../api/samples";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

type SampleFormProps = {
  studyId: number;
};

const sampleIdPattern = /^[a-zA-Z0-9-_]*$/;

const initialFormState = {
  sample_ID: "",
  sample_name: "",
  description: "",
  group: "",
  chemical: "",
  chemical_longname: "",
  dose: "0",
  technical_control: false,
  reference_rna: false,
  solvent_control: false,
};

export function SampleForm({ studyId }: SampleFormProps) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState(initialFormState);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const doseValue = useMemo(() => Number(formState.dose), [formState.dose]);

  const mutation = useMutation<Awaited<ReturnType<typeof createSample>>, Error, CreateSamplePayload>({
    mutationFn: (payload: CreateSamplePayload) => createSample(payload),
    onSuccess: () => {
      setFormState(initialFormState);
      setValidationMessage(null);
      void queryClient.invalidateQueries({ queryKey: ["samples", studyId] });
    },
    onError: (error) => {
      setValidationMessage(error.message);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sampleIdPattern.test(formState.sample_ID)) {
      setValidationMessage("sample_ID may only contain letters, numbers, hyphens, and underscores.");
      return;
    }

    if (Number.isNaN(doseValue) || doseValue < 0) {
      setValidationMessage("Dose must be zero or greater.");
      return;
    }

    setValidationMessage(null);
    mutation.mutate({
      study: studyId,
      sample_ID: formState.sample_ID,
      sample_name: formState.sample_name,
      description: formState.description,
      group: formState.group,
      chemical: formState.chemical,
      chemical_longname: formState.chemical_longname,
      dose: doseValue,
      technical_control: formState.technical_control,
      reference_rna: formState.reference_rna,
      solvent_control: formState.solvent_control,
    });
  }

  return (
    <form className="detail-form" onSubmit={handleSubmit}>
      <h3>Create a sample</h3>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="sample-id">Sample ID</Label>
          <Input
            id="sample-id"
            required
            value={formState.sample_ID}
            onChange={(event) => setFormState((current) => ({ ...current, sample_ID: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sample-name">Sample name</Label>
          <Input
            id="sample-name"
            required
            value={formState.sample_name}
            onChange={(event) => setFormState((current) => ({ ...current, sample_name: event.target.value }))}
          />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="sample-group">Group</Label>
          <Input
            id="sample-group"
            required
            value={formState.group}
            onChange={(event) => setFormState((current) => ({ ...current, group: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sample-dose">Dose</Label>
          <Input
            id="sample-dose"
            min="0"
            required
            step="any"
            type="number"
            value={formState.dose}
            onChange={(event) => setFormState((current) => ({ ...current, dose: event.target.value }))}
          />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="sample-chemical">Chemical</Label>
          <Input
            id="sample-chemical"
            value={formState.chemical}
            onChange={(event) => setFormState((current) => ({ ...current, chemical: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sample-chemical-long-name">Chemical long name</Label>
          <Input
            id="sample-chemical-long-name"
            value={formState.chemical_longname}
            onChange={(event) => setFormState((current) => ({ ...current, chemical_longname: event.target.value }))}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sample-description">Description</Label>
        <Textarea
          id="sample-description"
          rows={3}
          value={formState.description}
          onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
        />
      </div>
      <div className="grid gap-3 rounded-lg border border-border/70 bg-background/70 p-4">
        <p className="text-sm font-medium text-foreground">Control flags</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-3 text-sm font-medium text-foreground" htmlFor="sample-technical-control">
            <Checkbox
              checked={formState.technical_control}
              id="sample-technical-control"
              onCheckedChange={(checked) => setFormState((current) => ({ ...current, technical_control: checked === true }))}
            />
            Technical control
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-foreground" htmlFor="sample-reference-rna">
            <Checkbox
              checked={formState.reference_rna}
              id="sample-reference-rna"
              onCheckedChange={(checked) => setFormState((current) => ({ ...current, reference_rna: checked === true }))}
            />
            Reference RNA
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-foreground" htmlFor="sample-solvent-control">
            <Checkbox
              checked={formState.solvent_control}
              id="sample-solvent-control"
              onCheckedChange={(checked) => setFormState((current) => ({ ...current, solvent_control: checked === true }))}
            />
            Solvent control
          </label>
        </div>
      </div>
      <Button disabled={mutation.isPending} type="submit">
        {mutation.isPending ? "Creating..." : "Create sample"}
      </Button>
      {validationMessage ? <p className="error-text">{validationMessage}</p> : null}
    </form>
  );
}
