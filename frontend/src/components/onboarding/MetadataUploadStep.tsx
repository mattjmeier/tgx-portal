import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { useMutation } from "@tanstack/react-query";

import {
  validateMetadataUpload,
  type ValidateMetadataUploadResponse,
  type ValidationIssue,
} from "../../api/metadataValidation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type MetadataUploadStepProps = {
  studyId: number;
  expectedColumns: string[];
  fileName: string;
  onFileNameChange: (fileName: string) => void;
  onValidationResultChange?: (result: ValidateMetadataUploadResponse | null) => void;
};

function issueKey(issue: ValidationIssue): string {
  return `${issue.row_index}:${issue.column_key}:${issue.severity}:${issue.message}`;
}

export function MetadataUploadStep({
  studyId,
  expectedColumns,
  fileName,
  onFileNameChange,
  onValidationResultChange,
}: MetadataUploadStepProps) {
  const [parsedColumns, setParsedColumns] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Array<Record<string, unknown>>>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidateMetadataUploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const columnOrder = useMemo(() => {
    const fromFile = parsedColumns.length
      ? parsedColumns
      : Object.keys(parsedRows[0] ?? {});

    const expected = expectedColumns.filter((key) => key.trim().length > 0);
    if (expected.length === 0) {
      return fromFile;
    }

    return [
      ...expected,
      ...fromFile.filter((key) => !expected.includes(key)),
    ];
  }, [expectedColumns, parsedColumns, parsedRows]);

  const issues = validationResult?.issues ?? [];
  const fileIssues = useMemo(() => issues.filter((issue) => issue.row_index < 0), [issues]);
  const rowIssues = useMemo(() => issues.filter((issue) => issue.row_index >= 0), [issues]);
  const issuesByCell = useMemo(() => {
    const map = new Map<string, ValidationIssue[]>();
    for (const issue of rowIssues) {
      const key = `${issue.row_index}:${issue.column_key}`;
      const current = map.get(key) ?? [];
      current.push(issue);
      map.set(key, current);
    }
    return map;
  }, [rowIssues]);
  const issuesByRow = useMemo(() => {
    const map = new Map<number, ValidationIssue[]>();
    for (const issue of rowIssues) {
      const current = map.get(issue.row_index) ?? [];
      current.push(issue);
      map.set(issue.row_index, current);
    }
    return map;
  }, [rowIssues]);

  const validateMutation = useMutation<ValidateMetadataUploadResponse, Error, Array<Record<string, unknown>>>({
    mutationFn: async (rows) =>
      validateMetadataUpload({
        study_id: studyId,
        expected_columns: expectedColumns,
        rows,
      }),
    onSuccess: (result) => {
      setValidationError(null);
      setValidationResult(result);
      onValidationResultChange?.(result);
    },
    onError: (error) => {
      setValidationError(error.message);
      setValidationResult(null);
      onValidationResultChange?.(null);
    },
  });

  function parseAndValidateFile(file: File) {
    setParseError(null);
    setValidationError(null);
    setValidationResult(null);
    onFileNameChange(file.name);

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const rows = results.data.filter((row) => row && typeof row === "object");
        const fields = (results.meta.fields ?? []).filter((field): field is string => typeof field === "string" && field.trim().length > 0);
        setParsedRows(rows);
        setParsedColumns(fields.length ? fields : Object.keys(rows[0] ?? {}));
        validateMutation.mutate(rows);
      },
      error: () => {
        setParseError("Unable to parse the selected file.");
        setParsedRows([]);
        setParsedColumns([]);
        onValidationResultChange?.(null);
      },
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return (
    <div className="space-y-4">
      <div
        className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 p-5 text-center text-sm"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) {
            parseAndValidateFile(file);
          }
        }}
      >
        <p className="font-medium text-foreground">Drop a metadata CSV/TSV</p>
        <p className="text-muted-foreground">Parsed locally for preview, then validated server-side with aggregate issues.</p>
        <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
          Choose file
        </Button>
        <Input
          ref={fileInputRef}
          data-testid="metadata-file-input"
          id="filePicker"
          type="file"
          className="hidden"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              parseAndValidateFile(file);
            }
          }}
        />
        <p className="text-xs text-muted-foreground">Selected file: {fileName ? fileName : "None"}</p>
      </div>

      {parseError ? <p className="text-sm text-destructive">{parseError}</p> : null}
      {validationError ? <p className="text-sm text-destructive">{validationError}</p> : null}

      {parsedRows.length ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-muted-foreground">
              Previewing {parsedRows.length} rows.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={validateMutation.isPending || parsedRows.length === 0}
              onClick={() => validateMutation.mutate(parsedRows)}
            >
              {validateMutation.isPending ? "Validating…" : "Revalidate"}
            </Button>
          </div>

          <div className="preview-table-wrapper">
            <table className="preview-table">
              <thead>
                <tr>
                  {columnOrder.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 20).map((row, index) => {
                  const hasRowIssue = issuesByRow.has(index);
                  return (
                    <tr className={hasRowIssue ? "preview-row-error" : ""} key={`row-${index}`}>
                      {columnOrder.map((column) => {
                        const cellIssues = issuesByCell.get(`${index}:${column}`) ?? [];
                        const hasError = cellIssues.some((issue) => issue.severity === "error");
                        const hasWarning = !hasError && cellIssues.some((issue) => issue.severity === "warning");
                        const note = cellIssues.map((issue) => issue.message).join(" | ");
                        return (
                          <td
                            key={`${index}-${column}`}
                            className={[
                              hasError ? "preview-cell-error" : "",
                              hasWarning ? "bg-amber-50" : "",
                            ].filter(Boolean).join(" ")}
                            title={note || undefined}
                          >
                            <div className="preview-cell-content">
                              <span>{row[column] === undefined || row[column] === null ? "" : String(row[column])}</span>
                              {note ? <span className="preview-cell-error-note">{note}</span> : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {validationResult ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {validationResult.valid ? "Validation passed." : "Validation failed."}{" "}
                {errorCount ? `${errorCount} error(s).` : ""}{" "}
                {warningCount ? `${warningCount} warning(s).` : ""}
              </p>

              {issues.length ? (
                <div className="row-error-list">
                  {[...fileIssues, ...rowIssues].map((issue) => {
                    const prefix = issue.row_index < 0 ? "File" : `Row ${issue.row_index + 2}`;
                    return (
                      <p
                        key={issueKey(issue)}
                        className={issue.severity === "error" ? "error-text" : "text-muted-foreground"}
                      >
                        {prefix} • {issue.column_key}: {issue.message}
                      </p>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
