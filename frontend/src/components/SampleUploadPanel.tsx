import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { PaginatedResponse } from "../api/projects";
import { BulkSampleImportError, createSamplesBulk, type CreateSamplePayload } from "../api/samples";
import type { Sample } from "../api/samples";

type SampleUploadPanelProps = {
  studyId: number;
};

type ParsedUploadRow = {
  sample_ID: string;
  sample_name: string;
  description: string;
  group: string;
  chemical: string;
  chemical_longname: string;
  dose: string;
  technical_control: string;
  reference_rna: string;
  solvent_control: string;
};

const templateHeaders = [
  "sample_ID",
  "sample_name",
  "description",
  "group",
  "chemical",
  "chemical_longname",
  "dose",
  "technical_control",
  "reference_rna",
  "solvent_control",
];

const templateExampleRow = [
  "sample-001",
  "Sample 001",
  "Vehicle control replicate 1",
  "control",
  "",
  "",
  "0",
  "false",
  "false",
  "true",
];

function normalizeBoolean(value: string): boolean {
  return ["true", "1", "yes", "y"].includes(value.trim().toLowerCase());
}

function buildTemplateDownload() {
  const csv = [templateHeaders.join(","), templateExampleRow.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  return URL.createObjectURL(blob);
}

export function SampleUploadPanel({ studyId }: SampleUploadPanelProps) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ParsedUploadRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Array<{ rowNumber: number; message: string }>>([]);

  const templateUrl = useMemo(() => buildTemplateDownload(), []);

  useEffect(() => {
    setRows([]);
    setFileName("");
    setErrorMessage(null);
    setRowErrors([]);
  }, [studyId]);

  const mutation = useMutation<Awaited<ReturnType<typeof createSamplesBulk>>, Error, CreateSamplePayload[]>({
    mutationFn: (payload: CreateSamplePayload[]) => createSamplesBulk(payload),
    onSuccess: async (createdSamples) => {
      setErrorMessage(null);
      setRowErrors([]);
      setRows([]);
      setFileName("");
      queryClient.setQueryData<PaginatedResponse<Sample> | undefined>(["samples", studyId], (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          count: current.count + createdSamples.length,
          results: [...current.results, ...createdSamples],
        };
      });
      await queryClient.invalidateQueries({ queryKey: ["samples", studyId] });
    },
    onError: (error) => {
      if (error instanceof BulkSampleImportError) {
        setErrorMessage(error.message);
        setRowErrors(error.rowErrors);
        return;
      }

      setErrorMessage(error.message);
      setRowErrors([]);
    },
  });

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);
    setErrorMessage(null);
    setRowErrors([]);

    Papa.parse<ParsedUploadRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const normalizedRows = results.data.map((row) => ({
          sample_ID: row.sample_ID ?? "",
          sample_name: row.sample_name ?? "",
          description: row.description ?? "",
          group: row.group ?? "",
          chemical: row.chemical ?? "",
          chemical_longname: row.chemical_longname ?? "",
          dose: row.dose ?? "0",
          technical_control: row.technical_control ?? "false",
          reference_rna: row.reference_rna ?? "false",
          solvent_control: row.solvent_control ?? "false",
        }));

        setRows(normalizedRows);
      },
      error: () => {
        setErrorMessage("Unable to parse the selected file.");
        setRows([]);
      },
    });
  }

  function handleImport() {
    const payload: CreateSamplePayload[] = rows.map((row) => ({
      study: studyId,
      sample_ID: row.sample_ID.trim(),
      sample_name: row.sample_name.trim(),
      description: row.description.trim(),
      group: row.group.trim(),
      chemical: row.chemical.trim(),
      chemical_longname: row.chemical_longname.trim(),
      dose: Number(row.dose),
      technical_control: normalizeBoolean(row.technical_control),
      reference_rna: normalizeBoolean(row.reference_rna),
      solvent_control: normalizeBoolean(row.solvent_control),
    }));

    mutation.mutate(payload);
  }

  return (
    <section className="upload-panel">
      <div className="section-header compact-header">
        <div>
          <p className="eyebrow">Bulk upload</p>
          <h3>Import samples from CSV or TSV</h3>
        </div>
        <a className="ghost-link" download="sample-upload-template.csv" href={templateUrl}>
          Download template
        </a>
      </div>

      <p className="muted-copy">
        Use the template to prepare sample rows for the selected study, then upload the file for preview before import.
      </p>

      <label className="upload-dropzone">
        <input accept=".csv,.tsv,text/csv,text/tab-separated-values" className="sr-only" type="file" onChange={handleFileChange} />
        <span>{fileName ? `Loaded ${fileName}` : "Choose a CSV or TSV file to preview sample rows."}</span>
      </label>

      {rows.length > 0 ? (
        <>
          <div className="preview-table-wrapper">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>sample_ID</th>
                  <th>sample_name</th>
                  <th>group</th>
                  <th>dose</th>
                  <th>technical_control</th>
                  <th>reference_rna</th>
                  <th>solvent_control</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const rowError = rowErrors.find((entry) => entry.rowNumber === index + 2);
                  return (
                    <tr className={rowError ? "preview-row-error" : ""} key={`${row.sample_ID}-${index}`}>
                      <td>{row.sample_ID}</td>
                      <td>{row.sample_name}</td>
                      <td>{row.group}</td>
                      <td>{row.dose}</td>
                      <td>{row.technical_control}</td>
                      <td>{row.reference_rna}</td>
                      <td>{row.solvent_control}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="upload-actions">
            <p className="muted-copy">Previewing {rows.length} sample rows.</p>
            <button className="primary-button" disabled={mutation.isPending} type="button" onClick={handleImport}>
              {mutation.isPending ? "Importing..." : "Import samples"}
            </button>
          </div>
        </>
      ) : null}

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      {rowErrors.length > 0 ? (
        <div className="row-error-list">
          {rowErrors.map((entry) => (
            <p className="error-text" key={`${entry.rowNumber}-${entry.message}`}>
              Row {entry.rowNumber}: {entry.message}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
