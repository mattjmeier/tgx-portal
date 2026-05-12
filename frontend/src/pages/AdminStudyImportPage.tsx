import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { fetchLookups } from "../api/lookups";
import { fetchProjects } from "../api/projects";
import {
  commitStudyImport,
  createStudyImport,
  previewStudyImportContrasts,
  previewStudyImportMetadata,
  registerStudyImportCountResource,
  type StudyImportState,
} from "../api/studyImports";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";

type DraftFormState = {
  project_id: string;
  title: string;
  description: string;
  species: string;
  celltype: string;
  study_name: string;
  source: string;
  study_type: string;
  in_vitro: string;
  platform_id: string;
};

type MetadataMappingState = {
  source_column: string;
  target_field: string;
  transforms: string[];
};

const initialDraftForm: DraftFormState = {
  project_id: "",
  title: "",
  description: "",
  species: "human",
  celltype: "",
  study_name: "",
  source: "UL warehouse",
  study_type: "TGx",
  in_vitro: "true",
  platform_id: "",
};

const metadataTargetOptions = [
  "sample_ID",
  "sample_name",
  "description",
  "technical_control",
  "reference_rna",
  "solvent_control",
  "group",
  "chemical",
  "dose",
  "concentration",
  "timepoint",
  "batch",
  "plate",
];

const metadataTransformOptions = [
  { value: "trim", label: "Trim" },
  { value: "lowercase", label: "Lowercase" },
  { value: "uppercase", label: "Uppercase" },
  { value: "replace_whitespace_with_underscore", label: "Whitespace -> _" },
];

function inferDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes("\t") ? "\t" : ",";
}

function deriveMetadataMappings(content: string, current: MetadataMappingState[]): MetadataMappingState[] {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine.trim()) {
    return [];
  }
  const delimiter = inferDelimiter(content);
  const headers = firstLine
    .split(delimiter)
    .map((header) => header.trim())
    .filter(Boolean);
  return headers.map((header) => {
    const existing = current.find((mapping) => mapping.source_column === header);
    return (
      existing ?? {
        source_column: header,
        target_field: header,
        transforms: ["trim"],
      }
    );
  });
}

async function readTextFile(file: File): Promise<string> {
  return file.text();
}

export function AdminStudyImportPage() {
  const [draftForm, setDraftForm] = useState<DraftFormState>(initialDraftForm);
  const [importState, setImportState] = useState<StudyImportState | null>(null);
  const [metadataContent, setMetadataContent] = useState("");
  const [contrastsContent, setContrastsContent] = useState("");
  const [countContent, setCountContent] = useState("");
  const [metadataMappings, setMetadataMappings] = useState<MetadataMappingState[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects", "study-import-form"],
    queryFn: () => fetchProjects({ pageSize: 100 }),
  });
  const lookupsQuery = useQuery({
    queryKey: ["lookups", "study-import-form"],
    queryFn: fetchLookups,
  });

  const createMutation = useMutation({
    mutationFn: createStudyImport,
    onSuccess: (result: StudyImportState) => {
      setImportState(result);
      setErrorMessage(null);
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const metadataMutation = useMutation({
    mutationFn: async () => {
      if (!importState) {
        throw new Error("Create a draft import first.");
      }
      return previewStudyImportMetadata(importState.id, {
        filename: "metadata.tsv",
        content: metadataContent,
        mappings: metadataMappings,
      });
    },
    onSuccess: (result) => {
      setImportState((current) =>
        current
          ? {
              ...current,
              metadata_preview: {
                valid: result.valid,
                issues: result.issues,
                normalized_rows: result.normalized_rows,
                columns: result.columns,
              },
            }
          : current,
      );
      setErrorMessage(null);
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const contrastsMutation = useMutation({
    mutationFn: async () => {
      if (!importState) {
        throw new Error("Create a draft import first.");
      }
      return previewStudyImportContrasts(importState.id, {
        filename: "contrasts.tsv",
        content: contrastsContent,
      });
    },
    onSuccess: (result) => {
      setImportState((current) =>
        current
          ? {
              ...current,
              contrasts_preview: {
                valid: result.valid,
                issues: result.issues,
                contrasts: result.contrasts,
              },
            }
          : current,
      );
      setErrorMessage(null);
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const countMutation = useMutation({
    mutationFn: async () => {
      if (!importState) {
        throw new Error("Create a draft import first.");
      }
      return registerStudyImportCountResource(importState.id, {
        filename: "counts.tsv",
        content: countContent,
        feature_id_kind: "gene_symbol",
        annotation_source: "Ensembl",
        annotation_version: "current",
      });
    },
    onSuccess: (result) => {
      setImportState((current) =>
        current
          ? {
              ...current,
              count_resource: result.resource,
            }
          : current,
      );
      setErrorMessage(null);
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!importState) {
        throw new Error("Create a draft import first.");
      }
      return commitStudyImport(importState.id);
    },
    onSuccess: () => setErrorMessage(null),
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const unresolvedIssues = useMemo(
    () => [
      ...(importState?.metadata_preview.issues ?? []),
      ...(importState?.contrasts_preview.issues ?? []),
    ],
    [importState],
  );
  const canCommit = Boolean(
    importState &&
      importState.metadata_preview.valid &&
      importState.contrasts_preview.valid &&
      draftForm.project_id &&
      draftForm.title &&
      draftForm.study_name &&
      draftForm.platform_id,
  );

  return (
    <section className="workspace-route">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>New study import</CardTitle>
              <CardDescription>Create a staged admin import for curated profiling studies.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="project-select">Project</Label>
                <select
                  id="project-select"
                  aria-label="Project"
                  value={draftForm.project_id}
                  onChange={(event) => setDraftForm((current) => ({ ...current, project_id: event.target.value }))}
                >
                  <option value="">Select project</option>
                  {(projectsQuery.data?.results ?? []).map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="platform-select">Platform</Label>
                <select
                  id="platform-select"
                  aria-label="Platform"
                  value={draftForm.platform_id}
                  onChange={(event) => setDraftForm((current) => ({ ...current, platform_id: event.target.value }))}
                >
                  <option value="">Select platform</option>
                  {(lookupsQuery.data?.profiling_platforms ?? []).map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.platform_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="study-title">Study title</Label>
                <Input
                  id="study-title"
                  aria-label="Study title"
                  value={draftForm.title}
                  onChange={(event) => setDraftForm((current) => ({ ...current, title: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="warehouse-study-name">Warehouse study name</Label>
                <Input
                  id="warehouse-study-name"
                  aria-label="Warehouse study name"
                  value={draftForm.study_name}
                  onChange={(event) => setDraftForm((current) => ({ ...current, study_name: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cell-type">Cell type</Label>
                <Input
                  id="cell-type"
                  aria-label="Cell type"
                  value={draftForm.celltype}
                  onChange={(event) => setDraftForm((current) => ({ ...current, celltype: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="study-source">Source</Label>
                <Input
                  id="study-source"
                  aria-label="Source"
                  value={draftForm.source}
                  onChange={(event) => setDraftForm((current) => ({ ...current, source: event.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Button
                  type="button"
                  disabled={createMutation.isPending}
                  onClick={() =>
                    createMutation.mutate({
                      project_id: Number(draftForm.project_id),
                      title: draftForm.title,
                      description: draftForm.description,
                      species: draftForm.species,
                      celltype: draftForm.celltype,
                      study_name: draftForm.study_name,
                      source: draftForm.source,
                      study_type: draftForm.study_type,
                      in_vitro: draftForm.in_vitro === "true",
                      platform_id: Number(draftForm.platform_id),
                    })
                  }
                >
                  Create draft import
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadata mapping + preview</CardTitle>
              <CardDescription>Paste CSV or TSV content, then validate before commit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="metadata-file">Metadata file</Label>
                <Input
                  id="metadata-file"
                  type="file"
                  accept=".csv,.tsv,text/csv,text/tab-separated-values"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    const text = await readTextFile(file);
                    setMetadataContent(text);
                    setMetadataMappings((current) => deriveMetadataMappings(text, current));
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="metadata-content">Metadata file content</Label>
                <Textarea
                  id="metadata-content"
                  aria-label="Metadata file content"
                  value={metadataContent}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setMetadataContent(nextValue);
                    setMetadataMappings((current) => deriveMetadataMappings(nextValue, current));
                  }}
                />
              </div>
              {metadataMappings.length ? (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm font-medium">Column mapping</p>
                  {metadataMappings.map((mapping) => (
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_1.5fr]" key={mapping.source_column}>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Source column</p>
                        <p className="text-sm">{mapping.source_column}</p>
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`target-${mapping.source_column}`}>Canonical field</Label>
                        <select
                          id={`target-${mapping.source_column}`}
                          value={mapping.target_field}
                          onChange={(event) =>
                            setMetadataMappings((current) =>
                              current.map((entry) =>
                                entry.source_column === mapping.source_column
                                  ? { ...entry, target_field: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                        >
                          {metadataTargetOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-1">
                        <Label>Transforms</Label>
                        <div className="flex flex-wrap gap-3">
                          {metadataTransformOptions.map((option) => {
                            const checked = mapping.transforms.includes(option.value);
                            return (
                              <label className="flex items-center gap-2 text-sm" key={option.value}>
                                <input
                                  checked={checked}
                                  type="checkbox"
                                  onChange={(event) =>
                                    setMetadataMappings((current) =>
                                      current.map((entry) => {
                                        if (entry.source_column !== mapping.source_column) {
                                          return entry;
                                        }
                                        const transforms = event.target.checked
                                          ? [...entry.transforms, option.value]
                                          : entry.transforms.filter((value) => value !== option.value);
                                        return { ...entry, transforms };
                                      }),
                                    )
                                  }
                                />
                                <span>{option.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <Button type="button" disabled={!importState || metadataMutation.isPending} onClick={() => metadataMutation.mutate()}>
                Preview metadata
              </Button>
              {importState?.metadata_preview.normalized_rows.length ? (
                <pre className="overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {JSON.stringify(importState.metadata_preview.normalized_rows.slice(0, 5), null, 2)}
                </pre>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contrasts preview</CardTitle>
              <CardDescription>Validate group pairs against the normalized metadata groups.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="contrasts-file">Contrasts file</Label>
                <Input
                  id="contrasts-file"
                  type="file"
                  accept=".csv,.tsv,text/csv,text/tab-separated-values"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    setContrastsContent(await readTextFile(file));
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contrasts-content">Contrasts file content</Label>
                <Textarea id="contrasts-content" aria-label="Contrasts file content" value={contrastsContent} onChange={(event) => setContrastsContent(event.target.value)} />
              </div>
              <Button type="button" disabled={!importState || contrastsMutation.isPending} onClick={() => contrastsMutation.mutate()}>
                Preview contrasts
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Count resource</CardTitle>
              <CardDescription>Register the count matrix as provenance-backed study input for this MVP.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="count-file">Count file</Label>
                <Input
                  id="count-file"
                  type="file"
                  accept=".csv,.tsv,.txt,text/plain,text/csv,text/tab-separated-values"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    setCountContent(await readTextFile(file));
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="count-content">Count file content</Label>
                <Textarea id="count-content" aria-label="Count file content" value={countContent} onChange={(event) => setCountContent(event.target.value)} />
              </div>
              <Button type="button" disabled={!importState || countMutation.isPending} onClick={() => countMutation.mutate()}>
                Register count resource
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Commit import</CardTitle>
              <CardDescription>Write the study, warehouse metadata, samples, and provenance records.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button type="button" disabled={!canCommit || commitMutation.isPending} onClick={() => commitMutation.mutate()}>
                Commit import
              </Button>
              {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Review panel</CardTitle>
              <CardDescription>Keep unresolved issues visible while curating the import.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Metadata: {importState?.metadata_preview.valid ? "Ready" : "Pending"}</p>
              <p>Contrasts: {importState?.contrasts_preview.valid ? "Ready" : "Pending"}</p>
              <p>Count resource: {importState?.count_resource?.display_name ?? "Not registered"}</p>
              <p>Commit readiness: {canCommit ? "Ready" : "Blocked"}</p>
              {unresolvedIssues.length ? (
                <div className="space-y-2">
                  {unresolvedIssues.map((issue, index) => (
                    <p key={`${issue.row_index}-${issue.column_key}-${index}`}>
                      Row {issue.row_index >= 0 ? issue.row_index + 1 : "file"} · {issue.column_key}: {issue.message}
                    </p>
                  ))}
                </div>
              ) : (
                <p>No unresolved validation issues.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
