import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Circle } from "lucide-react";

import { fetchLookups, type MetadataFieldDefinition } from "../../api/lookups";
import { downloadProjectConfig } from "../../api/projects";
import { fetchStudy } from "../../api/studies";
import { downloadMetadataTemplate, previewMetadataTemplate } from "../../api/metadataTemplates";
import {
  fetchStudyOnboardingState,
  finalizeStudyOnboardingState,
  patchStudyOnboardingState,
  type ContrastPair,
  type StudyOnboardingMappings,
  type StudyOnboardingStatus,
} from "../../api/studyOnboarding";
import { studiesIndexPath, studyWorkspacePath } from "../../lib/routes";
import { MetadataUploadStep } from "./MetadataUploadStep";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Separator } from "../ui/separator";

type OnboardingStepKey = "details" | "template" | "upload" | "mappings" | "review";

type OnboardingDraftV1 = {
  version: 1;
  studyId: number;
  updatedAt: string;
  details: {
    piName: string;
    researcherName: string;
    description: string;
  };
  template: {
    includeChemical: boolean;
    optionalColumns: string[];
  };
  upload: {
    fileName: string;
  };
  mappings: {
    treatmentColumn: string;
    batchColumn: string;
  };
};

type OnboardingDraftV2 = {
  version: 2;
  studyId: number;
  updatedAt: string;
  details: {
    piName: string;
    researcherName: string;
    description: string;
  };
  template: {
    optionalFieldKeys: string[];
    customFieldKeys: string[];
  };
  upload: {
    fileName: string;
  };
  mappings: {
    treatmentColumn: string;
    batchColumn: string;
  };
};

type OnboardingDraftV3 = {
  version: 3;
  studyId: number;
  updatedAt: string;
  details: {
    piName: string;
    researcherName: string;
    description: string;
  };
  template: {
    optionalFieldKeys: string[];
    customFieldKeys: string[];
  };
  upload: {
    fileName: string;
    metadataColumns: string[];
    suggestedContrasts: ContrastPair[];
  };
  mappings: StudyOnboardingMappings & {
    selected_contrasts: ContrastPair[];
  };
};

const steps: Array<{
  key: OnboardingStepKey;
  title: string;
  description: string;
}> = [
  {
    key: "details",
    title: "Details",
    description: "High-level collaboration + study context.",
  },
  {
    key: "template",
    title: "Template",
    description: "Select columns and download a sheet.",
  },
  {
    key: "upload",
    title: "Upload",
    description: "Preview and validate a metadata file.",
  },
  {
    key: "mappings",
    title: "Mappings",
    description: "Define treatment/batch mappings.",
  },
  {
    key: "review",
    title: "Review",
    description: "Confirm draft and generate outputs.",
  },
];

function parseStudyId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStep(value: string | null): OnboardingStepKey {
  const keys = steps.map((step) => step.key);
  if (value && keys.includes(value as OnboardingStepKey)) {
    return value as OnboardingStepKey;
  }
  return "details";
}

function draftStorageKey(studyId: number) {
  return `tgx:onboarding:v1:study:${studyId}`;
}

function createDefaultDraft(studyId: number): OnboardingDraftV2 {
  return {
    version: 2,
    studyId,
    updatedAt: new Date().toISOString(),
    details: {
      piName: "",
      researcherName: "",
      description: "",
    },
    template: {
      optionalFieldKeys: [],
      customFieldKeys: [],
    },
    upload: {
      fileName: "",
    },
    mappings: {
      treatmentColumn: "",
      batchColumn: "",
    },
  };
}

function createDefaultDraftV3(studyId: number): OnboardingDraftV3 {
  return {
    version: 3,
    studyId,
    updatedAt: new Date().toISOString(),
    details: {
      piName: "",
      researcherName: "",
      description: "",
    },
    template: {
      optionalFieldKeys: [],
      customFieldKeys: [],
    },
    upload: {
      fileName: "",
      metadataColumns: [],
      suggestedContrasts: [],
    },
    mappings: {
      treatment_level_1: "",
      treatment_level_2: "",
      treatment_level_3: "",
      treatment_level_4: "",
      treatment_level_5: "",
      batch: "",
      pca_color: "",
      pca_shape: "",
      pca_alpha: "",
      clustering_group: "",
      report_faceting_group: "",
      selected_contrasts: [],
    },
  };
}

function migrateDraftV1ToV2(draft: OnboardingDraftV1): OnboardingDraftV2 {
  const optionalFieldKeys = new Set(draft.template.optionalColumns);
  if (draft.template.includeChemical) {
    optionalFieldKeys.add("chemical");
  }

  return {
    version: 2,
    studyId: draft.studyId,
    updatedAt: draft.updatedAt,
    details: draft.details,
    template: {
      optionalFieldKeys: Array.from(optionalFieldKeys),
      customFieldKeys: [],
    },
    upload: draft.upload,
    mappings: draft.mappings,
  };
}

function migrateDraftV2ToV3(draft: OnboardingDraftV2): OnboardingDraftV3 {
  const base = createDefaultDraftV3(draft.studyId);
  return {
    ...base,
    updatedAt: draft.updatedAt,
    details: draft.details,
    template: draft.template,
    upload: {
      ...base.upload,
      fileName: draft.upload.fileName,
    },
    mappings: {
      ...base.mappings,
      treatment_level_1: draft.mappings.treatmentColumn,
      batch: draft.mappings.batchColumn,
    },
  };
}

function loadDraft(studyId: number): OnboardingDraftV3 {
  const key = draftStorageKey(studyId);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return createDefaultDraftV3(studyId);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { studyId?: unknown }).studyId === studyId
    ) {
      const version = (parsed as { version?: unknown }).version;
      if (version === 3) {
        return parsed as OnboardingDraftV3;
      }
      if (version === 2) {
        return migrateDraftV2ToV3(parsed as OnboardingDraftV2);
      }
      if (version === 1) {
        return migrateDraftV2ToV3(migrateDraftV1ToV2(parsed as OnboardingDraftV1));
      }
    }
  } catch {
    // fall through
  }

  return createDefaultDraftV3(studyId);
}

function saveDraft(draft: OnboardingDraftV3) {
  localStorage.setItem(draftStorageKey(draft.studyId), JSON.stringify(draft));
}

export function StudyOnboardingWizard() {
  const params = useParams();
  const studyId = parseStudyId(params.studyId);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeStep = useMemo(() => parseStep(searchParams.get("step")), [searchParams]);
  const [templateDownloadError, setTemplateDownloadError] = useState<string | null>(null);
  const [onboardingSaveError, setOnboardingSaveError] = useState<string | null>(null);
  const [onboardingFinalizeError, setOnboardingFinalizeError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<OnboardingDraftV3 | null>(() => {
    if (studyId === null) {
      return null;
    }
    return loadDraft(studyId);
  });

  useEffect(() => {
    if (studyId === null) {
      return;
    }
    setDraft(loadDraft(studyId));
  }, [studyId]);

  useEffect(() => {
    if (!draft) {
      return;
    }
    saveDraft({ ...draft, updatedAt: new Date().toISOString() });
  }, [draft]);

  const studyQuery = useQuery({
    queryKey: ["study", studyId],
    queryFn: () => fetchStudy(studyId as number),
    enabled: studyId !== null,
  });

  const onboardingStateQuery = useQuery({
    queryKey: ["study-onboarding-state", studyId],
    queryFn: () => fetchStudyOnboardingState(studyId as number),
    enabled: studyId !== null,
  });

  useEffect(() => {
    if (!draft || !onboardingStateQuery.data) {
      return;
    }
    const backendMappings = onboardingStateQuery.data.mappings;
    const backendSelected = onboardingStateQuery.data.selected_contrasts ?? [];
    const hasLocalMappings =
      Boolean(draft.mappings.treatment_level_1) ||
      Boolean(draft.mappings.batch) ||
      draft.mappings.selected_contrasts.length > 0;
    if (hasLocalMappings) {
      return;
    }
    updateDraft((current) => ({
      ...current,
      mappings: {
        ...current.mappings,
        ...backendMappings,
        selected_contrasts: backendSelected,
      },
      upload: {
        ...current.upload,
        metadataColumns: onboardingStateQuery.data.metadata_columns ?? current.upload.metadataColumns,
        suggestedContrasts: onboardingStateQuery.data.suggested_contrasts ?? current.upload.suggestedContrasts,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingStateQuery.data?.updated_at]);

  const saveOnboardingDraftMutation = useMutation({
    mutationFn: async (payload: { mappings: StudyOnboardingMappings; selected_contrasts: ContrastPair[] }) =>
      patchStudyOnboardingState(studyId as number, payload),
    onSuccess: async (result) => {
      setOnboardingSaveError(null);
      queryClient.setQueryData(["study-onboarding-state", studyId], result);
    },
    onError: (error) => {
      setOnboardingSaveError(error instanceof Error ? error.message : "Unable to save onboarding draft.");
    },
  });

  const finalizeOnboardingMutation = useMutation({
    mutationFn: async () => finalizeStudyOnboardingState(studyId as number),
    onSuccess: async (result) => {
      setOnboardingFinalizeError(null);
      queryClient.setQueryData(["study-onboarding-state", studyId], result);
    },
    onError: (error) => {
      setOnboardingFinalizeError(error instanceof Error ? error.message : "Unable to finalize onboarding mappings.");
    },
  });

  const generateOutputsMutation = useMutation({
    mutationFn: async () => {
      const projectId = studyQuery.data?.project;
      if (!projectId) {
        throw new Error("Study project is unavailable.");
      }
      return downloadProjectConfig(projectId);
    },
    onSuccess: (blob) => {
      setGenerationError(null);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "config_bundle.zip";
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => {
      setGenerationError(error instanceof Error ? error.message : "Unable to generate outputs.");
    },
  });

  const activeIndex = steps.findIndex((step) => step.key === activeStep);
  const nextStep = activeIndex < steps.length - 1 ? steps[activeIndex + 1].key : null;
  const prevStep = activeIndex > 0 ? steps[activeIndex - 1].key : null;

  function goToStep(stepKey: OnboardingStepKey) {
    const nextParams = new URLSearchParams(searchParams);
    if (stepKey === "details") {
      nextParams.delete("step");
    } else {
      nextParams.set("step", stepKey);
    }
    setSearchParams(nextParams);
  }

  function updateDraft(
    updater: (current: OnboardingDraftV3) => OnboardingDraftV3,
  ) {
    setDraft((current) => (current ? updater(current) : current));
  }

  const lookupsQuery = useQuery({
    queryKey: ["lookups"],
    queryFn: fetchLookups,
  });

  const requiredFieldKeys = useMemo(() => {
    const defs = lookupsQuery.data?.metadata_field_definitions ?? [];
    const keys = defs.filter((definition) => definition.required).map((definition) => definition.key);
    return keys.length ? keys : ["sample_ID", "sample_name", "group"];
  }, [lookupsQuery.data]);

  const templatePreviewQuery = useQuery({
    queryKey: [
      "metadata-template-preview",
      studyId,
      draft.template.optionalFieldKeys,
      draft.template.customFieldKeys,
    ],
    queryFn: () =>
      previewMetadataTemplate({
        study_id: studyId as number,
        optional_field_keys: draft.template.optionalFieldKeys,
        custom_field_keys: draft.template.customFieldKeys,
      }),
    enabled: studyId !== null && !!lookupsQuery.data,
  });

  const stagedColumns = templatePreviewQuery.data?.columns ?? requiredFieldKeys;

  if (studyId === null) {
    return <p className="error-text">Invalid study ID.</p>;
  }

  if (!draft) {
    return <p>Loading onboarding draft...</p>;
  }

  const fieldDefinitions = lookupsQuery.data?.metadata_field_definitions ?? [];
  const requiredFields = fieldDefinitions.filter((definition) => definition.required);
  const optionalStandardFields = fieldDefinitions.filter(
    (definition) => !definition.required && definition.kind === "standard",
  );
  const optionalCustomFields = fieldDefinitions.filter(
    (definition) => !definition.required && definition.kind === "custom",
  );

  const optionalStandardGroups = optionalStandardFields.reduce<Record<string, MetadataFieldDefinition[]>>(
    (acc, field) => {
      const group = field.group || "Other";
      acc[group] = acc[group] ? [...acc[group], field] : [field];
      return acc;
    },
    {},
  );

  function toggleTemplateKey(current: string[], key: string, checked: boolean): string[] {
    if (checked) {
      return current.includes(key) ? current : [...current, key];
    }
    return current.filter((value) => value !== key);
  }

  const metadataColumns =
    draft.upload.metadataColumns.length
      ? draft.upload.metadataColumns
      : onboardingStateQuery.data?.metadata_columns ?? [];

  const suggestedContrasts =
    draft.upload.suggestedContrasts.length
      ? draft.upload.suggestedContrasts
      : onboardingStateQuery.data?.suggested_contrasts ?? [];

  const onboardingStatus: StudyOnboardingStatus = onboardingStateQuery.data?.status ?? "draft";

  const batchSelectValue = draft.mappings.batch ? draft.mappings.batch : "__none__";

  return (
    <section className="space-y-5">
      <div className="section-header">
        <div className="min-w-0">
          <p className="eyebrow">Metadata onboarding</p>
          <h2 className="truncate">{studyQuery.data?.title ?? "Study onboarding"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Guided intake shell for metadata details, template selection, upload/validation, mappings, and review.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild variant="ghost">
            <Link to={studyWorkspacePath(studyId)}>Back to study</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={studiesIndexPath}>Studies</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Stages</CardTitle>
          <CardDescription>Stage progression is route-safe; the current step is reflected in the URL.</CardDescription>
          <Separator />
          <nav aria-label="Onboarding steps" className="grid gap-2 md:grid-cols-5">
            {steps.map((step, index) => {
              const isComplete = index < activeIndex;
              const isActive = step.key === activeStep;

              return (
                <button
                  key={step.key}
                  type="button"
                  aria-current={isActive ? "step" : undefined}
                  className={[
                    "flex w-full items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors",
                    isActive ? "ring-1 ring-primary/40" : "hover:bg-muted/40",
                  ].join(" ")}
                  onClick={() => goToStep(step.key)}
                >
                  <span className="mt-0.5">
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{step.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{step.description}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </CardHeader>
      </Card>

      {activeStep === "details" ? (
        <Card>
          <CardHeader>
            <CardTitle>High-level details</CardTitle>
            <CardDescription>Capture ownership and context before configuring metadata templates.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="piName">PI name</Label>
              <Input
                id="piName"
                list={`piNameSuggestions-${studyId}`}
                value={draft.details.piName}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    details: { ...current.details, piName: event.target.value },
                  }))
                }
              />
              <datalist id={`piNameSuggestions-${studyId}`}>
                {(lookupsQuery.data?.lookups.soft.pi_name.values ?? []).map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Policy: lookup-backed select-or-create (scoped to accessible projects).
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="researcherName">Researcher name</Label>
              <Input
                id="researcherName"
                list={`researcherNameSuggestions-${studyId}`}
                value={draft.details.researcherName}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    details: { ...current.details, researcherName: event.target.value },
                  }))
                }
              />
              <datalist id={`researcherNameSuggestions-${studyId}`}>
                {(lookupsQuery.data?.lookups.soft.researcher_name.values ?? []).map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Policy: lookup-backed select-or-create (scoped to accessible projects).
              </p>
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={draft.details.description}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    details: { ...current.details, description: event.target.value },
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeStep === "template" ? (
        <Card>
          <CardHeader>
            <CardTitle>Template selection</CardTitle>
            <CardDescription>Pick optional columns from admin-managed definitions. Required columns are locked.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {lookupsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading metadata field definitions…</p>
            ) : lookupsQuery.isError ? (
              <p className="text-sm text-destructive">Unable to load lookups.</p>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2 rounded-md border border-border bg-muted/20 p-4">
                    <p className="text-sm font-medium text-foreground">Required</p>
                    <div className="mt-2 grid gap-2 text-sm">
                      {requiredFields.map((field) => (
                        <div key={field.key} className="flex items-start gap-2">
                          <Checkbox checked disabled aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{field.label}</p>
                            <p className="text-xs text-muted-foreground">{field.key}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Optional</p>
                    <div className="space-y-4">
                      {Object.entries(optionalStandardGroups).map(([group, fields]) => (
                        <div key={group} className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</p>
                          <div className="grid gap-2">
                            {fields.map((field) => {
                              const selected = draft.template.optionalFieldKeys.includes(field.key);
                              const checkboxId = `optional-${field.key}`;
                              return (
                                <div
                                  key={field.key}
                                  className="flex items-start gap-2 rounded-md border border-border bg-background p-3"
                                >
                                  <Checkbox
                                    id={checkboxId}
                                    checked={selected}
                                    onCheckedChange={(checked) =>
                                      updateDraft((current) => ({
                                        ...current,
                                        template: {
                                          ...current.template,
                                          optionalFieldKeys: toggleTemplateKey(
                                            current.template.optionalFieldKeys,
                                            field.key,
                                            checked === true,
                                          ),
                                        },
                                      }))
                                    }
                                  />
                                  <div className="min-w-0">
                                    <Label htmlFor={checkboxId} className="cursor-pointer text-sm font-medium text-foreground">
                                      {field.label}
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                      {field.description ? field.description : field.key}
                                      {field.auto_include_keys.length ? ` (auto-adds: ${field.auto_include_keys.join(", ")})` : ""}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {optionalCustomFields.length ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Custom typed fields</p>
                      <p className="text-xs text-muted-foreground">
                        Custom columns must come from admin-managed typed definitions (no freeform column names).
                      </p>
                      <div className="grid gap-2">
                        {optionalCustomFields.map((field) => {
                          const selected = draft.template.customFieldKeys.includes(field.key);
                          const checkboxId = `custom-${field.key}`;
                          return (
                            <div key={field.key} className="flex items-start gap-2 rounded-md border border-border bg-background p-3">
                              <Checkbox
                                id={checkboxId}
                                checked={selected}
                                onCheckedChange={(checked) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    template: {
                                      ...current.template,
                                      customFieldKeys: toggleTemplateKey(
                                        current.template.customFieldKeys,
                                        field.key,
                                        checked === true,
                                      ),
                                    },
                                  }))
                                }
                              />
                              <div className="min-w-0">
                                <Label htmlFor={checkboxId} className="cursor-pointer text-sm font-medium text-foreground">
                                  {field.label}
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  {field.description ? field.description : `${field.key} (${field.data_type})`}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <div className="rounded-md border border-border bg-muted/20 p-4 text-sm">
                    <p className="font-medium text-foreground">Selected columns</p>
                    {templatePreviewQuery.isLoading ? (
                      <p className="mt-2 text-muted-foreground">Building template preview…</p>
                    ) : templatePreviewQuery.isError ? (
                      <p className="mt-2 text-destructive">Template preview failed.</p>
                    ) : templatePreviewQuery.data ? (
                      <div className="mt-2 space-y-2">
                        <p className="text-muted-foreground">{templatePreviewQuery.data.columns.join(", ")}</p>
                        {templatePreviewQuery.data.auto_included.length ? (
                          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                            {templatePreviewQuery.data.auto_included.map((item) => (
                              <li key={item.key}>
                                Auto-added {item.key}: {item.reason}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {templatePreviewQuery.data.deprecated_fields.length ? (
                          <p className="text-xs text-muted-foreground">
                            Deprecated fields included for compatibility: {templatePreviewQuery.data.deprecated_fields.join(", ")}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-muted-foreground">Select columns to preview.</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      disabled={!templatePreviewQuery.data}
                      onClick={async () => {
                        if (studyId === null) {
                          return;
                        }
                        setTemplateDownloadError(null);
                        try {
                          const { blob, filename } = await downloadMetadataTemplate({
                            study_id: studyId,
                            optional_field_keys: draft.template.optionalFieldKeys,
                            custom_field_keys: draft.template.customFieldKeys,
                          });
                          const url = URL.createObjectURL(blob);
                          const anchor = document.createElement("a");
                          anchor.href = url;
                          anchor.download = filename ?? templatePreviewQuery.data?.filename ?? "metadata.csv";
                          anchor.click();
                          URL.revokeObjectURL(url);
                        } catch (error) {
                          setTemplateDownloadError(
                            error instanceof Error ? error.message : "Failed to download the template.",
                          );
                        }
                      }}
                    >
                      Download template
                    </Button>
                    {templatePreviewQuery.data ? (
                      <p className="text-xs text-muted-foreground">Filename: {templatePreviewQuery.data.filename}</p>
                    ) : null}
                  </div>
                  {templateDownloadError ? <p className="text-sm text-destructive">{templateDownloadError}</p> : null}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeStep === "upload" ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload + validation</CardTitle>
            <CardDescription>Drop a sheet for local preview, then validate all discovered issues in one pass.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MetadataUploadStep
              studyId={studyId}
              expectedColumns={stagedColumns}
              fileName={draft.upload.fileName}
              onFileNameChange={(nextFileName) =>
                updateDraft((current) => ({
                  ...current,
                  upload: { ...current.upload, fileName: nextFileName },
                }))
              }
              onValidationResultChange={(result) => {
                if (!result) {
                  return;
                }

                updateDraft((current) => {
                  const nextSuggested = result.suggested_contrasts ?? [];
                  const shouldDefaultSelected =
                    current.mappings.selected_contrasts.length === 0 && nextSuggested.length > 0;

                  return {
                    ...current,
                    upload: {
                      ...current.upload,
                      metadataColumns: result.columns ?? [],
                      suggestedContrasts: nextSuggested,
                    },
                    mappings: {
                      ...current.mappings,
                      selected_contrasts: shouldDefaultSelected ? nextSuggested : current.mappings.selected_contrasts,
                    },
                  };
                });

                queryClient.invalidateQueries({ queryKey: ["study-onboarding-state", studyId] });
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {activeStep === "mappings" ? (
        <Card>
          <CardHeader>
            <CardTitle>Contrasts + mappings</CardTitle>
            <CardDescription>
              Save draft mappings now; finalize later to unblock output generation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Status: {onboardingStatus}</p>

            {metadataColumns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Upload and validate a metadata file before selecting mapping columns.
              </p>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="treatment_level_1">Treatment level 1 (required)</Label>
                      <Select
                        value={draft.mappings.treatment_level_1 || undefined}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            mappings: { ...current.mappings, treatment_level_1: value },
                          }))
                        }
                      >
                        <SelectTrigger id="treatment_level_1" aria-label="Treatment level 1">
                          <SelectValue placeholder="Select a metadata column" />
                        </SelectTrigger>
                        <SelectContent>
                          {metadataColumns.map((column) => (
                            <SelectItem key={column} value={column}>
                              {column}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="treatment_level_2">Treatment level 2</Label>
                      <Select
                        value={draft.mappings.treatment_level_2 ? draft.mappings.treatment_level_2 : "__none__"}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            mappings: { ...current.mappings, treatment_level_2: value === "__none__" ? "" : value },
                          }))
                        }
                      >
                        <SelectTrigger id="treatment_level_2">
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {metadataColumns.map((column) => (
                            <SelectItem key={column} value={column}>
                              {column}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="treatment_level_3">Treatment level 3</Label>
                      <Select
                        value={draft.mappings.treatment_level_3 ? draft.mappings.treatment_level_3 : "__none__"}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            mappings: { ...current.mappings, treatment_level_3: value === "__none__" ? "" : value },
                          }))
                        }
                      >
                        <SelectTrigger id="treatment_level_3">
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {metadataColumns.map((column) => (
                            <SelectItem key={column} value={column}>
                              {column}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="treatment_level_4">Treatment level 4</Label>
                      <Select
                        value={draft.mappings.treatment_level_4 ? draft.mappings.treatment_level_4 : "__none__"}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            mappings: { ...current.mappings, treatment_level_4: value === "__none__" ? "" : value },
                          }))
                        }
                      >
                        <SelectTrigger id="treatment_level_4">
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {metadataColumns.map((column) => (
                            <SelectItem key={column} value={column}>
                              {column}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="treatment_level_5">Treatment level 5</Label>
                      <Select
                        value={draft.mappings.treatment_level_5 ? draft.mappings.treatment_level_5 : "__none__"}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            mappings: { ...current.mappings, treatment_level_5: value === "__none__" ? "" : value },
                          }))
                        }
                      >
                        <SelectTrigger id="treatment_level_5">
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {metadataColumns.map((column) => (
                            <SelectItem key={column} value={column}>
                              {column}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="batch">Batch</Label>
                      <Select
                        value={batchSelectValue}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            mappings: { ...current.mappings, batch: value === "__none__" ? "" : value },
                          }))
                        }
                      >
                        <SelectTrigger id="batch">
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {metadataColumns.map((column) => (
                            <SelectItem key={column} value={column}>
                              {column}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-md border border-border bg-muted/20 p-4 text-sm">
                    <p className="font-medium text-foreground">Optional display/grouping variables</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      These feed downstream PCA coloring/shaping and report groupings.
                    </p>

                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      {(
                        [
                          ["pca_color", "PCA color"],
                          ["pca_shape", "PCA shape"],
                          ["pca_alpha", "PCA alpha"],
                          ["clustering_group", "Clustering group"],
                          ["report_faceting_group", "Report faceting group"],
                        ] as const
                      ).map(([key, label]) => {
                        const value = draft.mappings[key] ? draft.mappings[key] : "__none__";
                        return (
                          <div key={key} className="space-y-2">
                            <Label htmlFor={key}>{label}</Label>
                            <Select
                              value={value}
                              onValueChange={(nextValue) =>
                                updateDraft((current) => ({
                                  ...current,
                                  mappings: {
                                    ...current.mappings,
                                    [key]: nextValue === "__none__" ? "" : nextValue,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger id={key}>
                                <SelectValue placeholder="Optional" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {metadataColumns.map((column) => (
                                  <SelectItem key={column} value={column}>
                                    {column}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saveOnboardingDraftMutation.isPending}
                      onClick={() => {
                        const { selected_contrasts, ...mappingsPayload } = draft.mappings;
                        setOnboardingSaveError(null);
                        saveOnboardingDraftMutation.mutate({
                          mappings: mappingsPayload,
                          selected_contrasts,
                        });
                      }}
                    >
                      {saveOnboardingDraftMutation.isPending ? "Saving…" : "Save draft"}
                    </Button>
                    <Button
                      type="button"
                      disabled={finalizeOnboardingMutation.isPending}
                      onClick={async () => {
                        const { selected_contrasts, ...mappingsPayload } = draft.mappings;
                        setOnboardingFinalizeError(null);
                        try {
                          await saveOnboardingDraftMutation.mutateAsync({
                            mappings: mappingsPayload,
                            selected_contrasts,
                          });
                          await finalizeOnboardingMutation.mutateAsync();
                        } catch {
                          // mutation handlers surface errors
                        }
                      }}
                    >
                      {finalizeOnboardingMutation.isPending ? "Finalizing…" : "Finalize mappings"}
                    </Button>
                  </div>

                  {onboardingSaveError ? <p className="text-sm text-destructive">{onboardingSaveError}</p> : null}
                  {onboardingFinalizeError ? <p className="text-sm text-destructive">{onboardingFinalizeError}</p> : null}
                </div>

                <div className="space-y-3">
                  <div className="rounded-md border border-border bg-muted/20 p-4 text-sm">
                    <p className="font-medium text-foreground">Suggested contrasts</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Derived from uploaded metadata columns `group` and `solvent_control`.
                    </p>

                    {suggestedContrasts.length === 0 ? (
                      <p className="mt-3 text-muted-foreground">No contrast suggestions available yet.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              updateDraft((current) => ({
                                ...current,
                                mappings: { ...current.mappings, selected_contrasts: suggestedContrasts },
                              }))
                            }
                          >
                            Select all
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              updateDraft((current) => ({
                                ...current,
                                mappings: { ...current.mappings, selected_contrasts: [] },
                              }))
                            }
                          >
                            Clear
                          </Button>
                        </div>

                        <ul className="space-y-2">
                          {suggestedContrasts.map((pair, index) => {
                            const key = `${pair.reference_group}:${pair.comparison_group}`;
                            const inputId = `contrast-${index}`;
                            const checked = draft.mappings.selected_contrasts.some(
                              (item) =>
                                item.reference_group === pair.reference_group &&
                                item.comparison_group === pair.comparison_group,
                            );
                            return (
                              <li key={key} className="flex items-start gap-2">
                                <Checkbox
                                  id={inputId}
                                  checked={checked}
                                  onCheckedChange={(nextChecked) =>
                                    updateDraft((current) => {
                                      const currentPairs = current.mappings.selected_contrasts;
                                      const alreadySelected = currentPairs.some(
                                        (item) =>
                                          item.reference_group === pair.reference_group &&
                                          item.comparison_group === pair.comparison_group,
                                      );
                                      if (nextChecked === true) {
                                        return {
                                          ...current,
                                          mappings: {
                                            ...current.mappings,
                                            selected_contrasts: alreadySelected ? currentPairs : [...currentPairs, pair],
                                          },
                                        };
                                      }
                                      return {
                                        ...current,
                                        mappings: {
                                          ...current.mappings,
                                          selected_contrasts: currentPairs.filter(
                                            (item) =>
                                              !(
                                                item.reference_group === pair.reference_group &&
                                                item.comparison_group === pair.comparison_group
                                              ),
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <Label htmlFor={inputId} className="cursor-pointer text-sm text-foreground">
                                  {pair.reference_group} → {pair.comparison_group}
                                </Label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeStep === "review" ? (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>
              Draft saves are allowed, but output generation is blocked until mappings are finalized.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-md border border-border bg-muted/20 p-4">
              <p className="font-medium text-foreground">Summary</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>PI: {draft.details.piName || "—"}</li>
                <li>Researcher: {draft.details.researcherName || "—"}</li>
                <li>Template columns: {stagedColumns.length ? stagedColumns.join(", ") : "—"}</li>
                <li>Upload: {draft.upload.fileName || "—"}</li>
                <li>Onboarding status: {onboardingStatus}</li>
                <li>Treatment level 1: {draft.mappings.treatment_level_1 || "—"}</li>
                <li>Batch: {draft.mappings.batch || "—"}</li>
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  updateDraft(() => createDefaultDraftV3(studyId))
                }
              >
                Reset draft
              </Button>
              <Button
                type="button"
                disabled={onboardingStatus !== "final" || generateOutputsMutation.isPending}
                onClick={() => {
                  setGenerationError(null);
                  generateOutputsMutation.mutate();
                }}
              >
                {generateOutputsMutation.isPending ? "Generating…" : "Generate outputs"}
              </Button>
            </div>
            {generationError ? <p className="text-sm text-destructive">{generationError}</p> : null}
            {onboardingStatus !== "final" ? (
              <p className="text-sm text-muted-foreground">
                Finalize mappings in the Mappings stage to unblock output generation.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" disabled={!prevStep} onClick={() => prevStep && goToStep(prevStep)}>
          Back
        </Button>
        <Button type="button" disabled={!nextStep} onClick={() => nextStep && goToStep(nextStep)}>
          Next
        </Button>
      </div>
    </section>
  );
}
