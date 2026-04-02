import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createSample, type CreateSamplePayload } from "../api/samples";

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
      <label>
        Sample ID
        <input
          required
          value={formState.sample_ID}
          onChange={(event) => setFormState((current) => ({ ...current, sample_ID: event.target.value }))}
        />
      </label>
      <label>
        Sample name
        <input
          required
          value={formState.sample_name}
          onChange={(event) => setFormState((current) => ({ ...current, sample_name: event.target.value }))}
        />
      </label>
      <label>
        Group
        <input
          required
          value={formState.group}
          onChange={(event) => setFormState((current) => ({ ...current, group: event.target.value }))}
        />
      </label>
      <label>
        Chemical
        <input
          value={formState.chemical}
          onChange={(event) => setFormState((current) => ({ ...current, chemical: event.target.value }))}
        />
      </label>
      <label>
        Chemical long name
        <input
          value={formState.chemical_longname}
          onChange={(event) => setFormState((current) => ({ ...current, chemical_longname: event.target.value }))}
        />
      </label>
      <label>
        Dose
        <input
          min="0"
          required
          step="any"
          type="number"
          value={formState.dose}
          onChange={(event) => setFormState((current) => ({ ...current, dose: event.target.value }))}
        />
      </label>
      <label>
        Description
        <textarea
          rows={3}
          value={formState.description}
          onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
        />
      </label>
      <div className="checkbox-grid">
        <label className="checkbox-row">
          <input
            checked={formState.technical_control}
            type="checkbox"
            onChange={(event) => setFormState((current) => ({ ...current, technical_control: event.target.checked }))}
          />
          Technical control
        </label>
        <label className="checkbox-row">
          <input
            checked={formState.reference_rna}
            type="checkbox"
            onChange={(event) => setFormState((current) => ({ ...current, reference_rna: event.target.checked }))}
          />
          Reference RNA
        </label>
        <label className="checkbox-row">
          <input
            checked={formState.solvent_control}
            type="checkbox"
            onChange={(event) => setFormState((current) => ({ ...current, solvent_control: event.target.checked }))}
          />
          Solvent control
        </label>
      </div>
      <button className="primary-button" disabled={mutation.isPending} type="submit">
        {mutation.isPending ? "Creating..." : "Create sample"}
      </button>
      {validationMessage ? <p className="error-text">{validationMessage}</p> : null}
    </form>
  );
}
