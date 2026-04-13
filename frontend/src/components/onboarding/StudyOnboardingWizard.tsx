import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, Plus, X } from "lucide-react";

import { fetchLookups, type MetadataFieldDefinition } from "../../api/lookups";
import { downloadMetadataTemplate, previewMetadataTemplate } from "../../api/metadataTemplates";
import { downloadProjectConfig } from "../../api/projects";
import {
  fetchStudy,
  updateStudy,
  type Study,
} from "../../api/studies";
import {
  fetchStudyOnboardingState,
  finalizeStudyOnboardingState,
  patchStudyOnboardingState,
  type ContrastPair,
  type StudyOnboardingMappings,
  type StudyOnboardingStatus,
  type StudyTemplateContext,
} from "../../api/studyOnboarding";
import { MetadataUploadStep } from "./MetadataUploadStep";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";

type OnboardingStepKey = "details" | "template" | "upload" | "mappings" | "review";

type StepAttemptState = Partial<Record<OnboardingStepKey, boolean>>;

type LegacyOnboardingDraftV4 = {
  version: 4;
  studyId: number;
  updatedAt: string;
  details: {
    title: string;
    piName: string;
    researcherName: string;
    description: string;
  };
  template: {
    species: Study["species"];
    celltype: string;
    treatmentVar: string;
    batchVar: string;
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

type OnboardingDraftV5 = {
  version: 5;
  studyId: number;
  updatedAt: string;
  details: {
    title: string;
    piName: string;
    researcherName: string;
    description: string;
  };
  template: {
    species: Study["species"];
    celltype: string;
    context: StudyTemplateContext;
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

type OnboardingDraftV6 = {
  version: 6;
  studyId: number;
  updatedAt: string;
  attempts: StepAttemptState;
  details: {
    title: string;
    piName: string;
    researcherName: string;
    description: string;
  };
  template: {
    species: Study["species"];
    celltype: string;
    context: StudyTemplateContext;
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

type ChipSelectOrAddProps = {
  label: string;
  description: string;
  values: string[];
  suggestions: string[];
  inputId: string;
  addLabel: string;
  required?: boolean;
  onChange: (values: string[]) => void;
};

const STUDY_DESIGN_OPTIONS = [
  {
    key: "chemical",
    label: "Chemical",
    description: "Include chemical metadata and CAS compatibility columns.",
  },
  {
    key: "dose",
    label: "Dose",
    description: "Include dose metadata for toxicology studies.",
  },
  {
    key: "timepoint",
    label: "Timepoint",
    description: "Track exposure duration or collection time.",
  },
  {
    key: "treatment",
    label: "Treatment",
    description: "Require at least one treatment variable for the template context.",
  },
  {
    key: "batch",
    label: "Batch",
    description: "Require at least one batch variable for the template context.",
  },
] as const;

const STUDY_DESIGN_FIELD_MAP: Record<string, string[]> = {
  chemical: ["chemical"],
  dose: ["dose"],
  timepoint: ["timepoint"],
  treatment: [],
  batch: [],
};

const SEQUENCING_FIELD_KEYS = ["i5_index", "i7_index", "well_id", "sequencing_mode"] as const;
const STANDARD_UI_FIELD_KEYS = new Set<string>(["timepoint"]);
const FIELD_DESCRIPTION_OVERRIDES: Record<string, string> = {
  concentration: "Select for in vitro experiments.",
  dose: "Select for in vivo experiments.",
};

const steps: Array<{
  key: OnboardingStepKey;
  title: string;
  description: string;
}> = [
  {
    key: "details",
    title: "Study details",
    description: "Capture the basic study context before defining the metadata template.",
  },
  {
    key: "template",
    title: "Template design",
    description: "Choose study design elements and download the right metadata template.",
  },
  {
    key: "upload",
    title: "Upload metadata",
    description: "Preview the sheet and validate every issue in one pass before mappings.",
  },
  {
    key: "mappings",
    title: "Mappings",
    description: "Pick the primary treatment and batch columns used for downstream generation.",
  },
  {
    key: "review",
    title: "Review",
    description: "Confirm the template context and generate outputs once onboarding is final.",
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
  return `tgx:onboarding:v2:study:${studyId}`;
}

function createEmptyTemplateContext(): StudyTemplateContext {
  return {
    study_design_elements: [],
    treatment_vars: [],
    batch_vars: [],
    optional_field_keys: [],
    custom_field_keys: [],
  };
}

function createDefaultDraft(studyId: number): OnboardingDraftV6 {
  return {
    version: 6,
    studyId,
    updatedAt: new Date().toISOString(),
    attempts: {},
    details: {
      title: "",
      piName: "",
      researcherName: "",
      description: "",
    },
    template: {
      species: null,
      celltype: "",
      context: createEmptyTemplateContext(),
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

function normalizeValueList(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const candidate = value.trim().replace(/\s+/g, "_");
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    normalized.push(candidate);
  }
  return normalized;
}

function migrateDraftV4ToV5(draft: LegacyOnboardingDraftV4): OnboardingDraftV5 {
  const next = createDefaultDraft(draft.studyId);
  return {
    ...next,
    version: 5,
    updatedAt: draft.updatedAt,
    details: draft.details,
    template: {
      species: draft.template.species,
      celltype: draft.template.celltype,
      context: {
        ...createEmptyTemplateContext(),
        treatment_vars: normalizeValueList(draft.template.treatmentVar ? [draft.template.treatmentVar] : []),
        batch_vars: normalizeValueList(draft.template.batchVar ? [draft.template.batchVar] : []),
        optional_field_keys: normalizeValueList(draft.template.optionalFieldKeys),
        custom_field_keys: normalizeValueList(draft.template.customFieldKeys),
      },
    },
    upload: draft.upload,
    mappings: draft.mappings,
  };
}

function migrateDraftV5ToV6(draft: OnboardingDraftV5): OnboardingDraftV6 {
  const next = createDefaultDraft(draft.studyId);
  return {
    ...next,
    updatedAt: draft.updatedAt,
    details: draft.details,
    template: draft.template,
    upload: draft.upload,
    mappings: draft.mappings,
  };
}

function loadDraft(studyId: number): OnboardingDraftV6 {
  const raw = localStorage.getItem(draftStorageKey(studyId));
  if (!raw) {
    return createDefaultDraft(studyId);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return createDefaultDraft(studyId);
    }
    if ((parsed as { version?: unknown }).version === 6) {
      return parsed as OnboardingDraftV6;
    }
    if ((parsed as { version?: unknown }).version === 5) {
      return migrateDraftV5ToV6(parsed as OnboardingDraftV5);
    }
    if ((parsed as { version?: unknown }).version === 4) {
      return migrateDraftV5ToV6(migrateDraftV4ToV5(parsed as LegacyOnboardingDraftV4));
    }
  } catch {
    return createDefaultDraft(studyId);
  }

  return createDefaultDraft(studyId);
}

function saveDraft(draft: OnboardingDraftV6) {
  localStorage.setItem(draftStorageKey(draft.studyId), JSON.stringify(draft));
}

function isTemplateContextEmpty(context: StudyTemplateContext): boolean {
  return (
    context.study_design_elements.length === 0 &&
    context.treatment_vars.length === 0 &&
    context.batch_vars.length === 0 &&
    context.optional_field_keys.length === 0 &&
    context.custom_field_keys.length === 0
  );
}

function toggleValue(current: string[], value: string): string[] {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function getDerivedOptionalFieldKeys(
  context: StudyTemplateContext,
  fieldDefinitions: MetadataFieldDefinition[],
): string[] {
  const available = new Set(fieldDefinitions.map((field) => field.key));
  const derived: string[] = [];
  for (const element of context.study_design_elements) {
    for (const key of STUDY_DESIGN_FIELD_MAP[element] ?? []) {
      if (available.has(key) && !derived.includes(key)) {
        derived.push(key);
      }
    }
  }
  return derived;
}

function areStringListsEqual(left: string[], right: string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function areTemplateContextsEqual(left: StudyTemplateContext, right: StudyTemplateContext): boolean {
  return (
    areStringListsEqual(left.study_design_elements, right.study_design_elements) &&
    areStringListsEqual(left.treatment_vars, right.treatment_vars) &&
    areStringListsEqual(left.batch_vars, right.batch_vars) &&
    areStringListsEqual(left.optional_field_keys, right.optional_field_keys) &&
    areStringListsEqual(left.custom_field_keys, right.custom_field_keys)
  );
}

function areMappingsEqual(
  left: StudyOnboardingMappings & { selected_contrasts: ContrastPair[] },
  right: StudyOnboardingMappings,
  selectedContrasts: ContrastPair[],
): boolean {
  return (
    left.treatment_level_1 === right.treatment_level_1 &&
    left.treatment_level_2 === right.treatment_level_2 &&
    left.treatment_level_3 === right.treatment_level_3 &&
    left.treatment_level_4 === right.treatment_level_4 &&
    left.treatment_level_5 === right.treatment_level_5 &&
    left.batch === right.batch &&
    left.pca_color === right.pca_color &&
    left.pca_shape === right.pca_shape &&
    left.pca_alpha === right.pca_alpha &&
    left.clustering_group === right.clustering_group &&
    left.report_faceting_group === right.report_faceting_group &&
    JSON.stringify(left.selected_contrasts) === JSON.stringify(selectedContrasts)
  );
}

function ChipSelectOrAdd({
  label,
  description,
  values,
  suggestions,
  inputId,
  addLabel,
  required = false,
  onChange,
}: ChipSelectOrAddProps) {
  const [draftValue, setDraftValue] = useState("");

  function addCurrentValue() {
    const nextValue = draftValue.trim().replace(/\s+/g, "_");
    if (!nextValue) {
      return;
    }
    onChange(normalizeValueList([...values, nextValue]));
    setDraftValue("");
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label htmlFor={inputId} className="text-sm font-medium text-foreground">
            {label}
          </Label>
          {required ? <Badge variant="outline">Required</Badge> : null}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {values.length === 0 ? (
          <p className="text-sm text-muted-foreground">No values added yet.</p>
        ) : (
          values.map((value) => (
            <Badge key={value} variant="secondary" className="gap-1 rounded-full px-3 py-1">
              <span>{value}</span>
              <button
                type="button"
                aria-label={`Remove ${value}`}
                className="rounded-full p-0.5 transition-colors hover:bg-background/80"
                onClick={() => onChange(values.filter((item) => item !== value))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          list={`${inputId}-suggestions`}
          value={draftValue}
          placeholder={addLabel}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCurrentValue();
            }
          }}
        />
        <datalist id={`${inputId}-suggestions`}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <Button type="button" variant="secondary" onClick={addCurrentValue}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

type TemplateFieldOptionProps = {
  field: MetadataFieldDefinition;
  selected: boolean;
  locked?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function TemplateFieldOption({
  field,
  selected,
  locked = false,
  onCheckedChange,
}: TemplateFieldOptionProps) {
  const checkboxId = `template-field-${field.key}`;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-background p-3">
      <Checkbox
        id={checkboxId}
        data-testid={`template-field-checkbox-${field.key}`}
        aria-label={field.label}
        checked={selected}
        disabled={locked}
        onCheckedChange={(checked) => onCheckedChange(checked === true)}
      />
      <div className="min-w-0">
        <Label htmlFor={checkboxId} className="cursor-pointer text-sm font-medium text-foreground">
          {field.label}
        </Label>
        <p className="text-xs text-muted-foreground">
          {FIELD_DESCRIPTION_OVERRIDES[field.key] ?? (field.description ? field.description : field.key)}
        </p>
        {locked ? <p className="mt-1 text-xs text-muted-foreground">Auto-included from study design.</p> : null}
      </div>
    </div>
  );
}

type CustomFieldAdderProps = {
  suggestions: string[];
  existingValues: string[];
  onAdd: (value: string) => void;
};

function CustomFieldAdder({ suggestions, existingValues, onAdd }: CustomFieldAdderProps) {
  const [draftValue, setDraftValue] = useState("");

  function handleAdd() {
    const nextValue = draftValue.trim().replace(/\s+/g, "_");
    if (!nextValue || existingValues.includes(nextValue)) {
      return;
    }
    onAdd(nextValue);
    setDraftValue("");
  }

  return (
    <Collapsible className="rounded-xl border border-dashed border-border/70 bg-background p-3">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="secondary">
          <Plus className="h-4 w-4" />
          Add custom field
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 flex flex-col gap-3">
        <div className="space-y-2">
          <Label htmlFor="custom-field-name">Custom field name</Label>
          <Input
            id="custom-field-name"
            list="custom-field-suggestions"
            value={draftValue}
            placeholder="Add a study-specific field"
            onChange={(event) => setDraftValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAdd();
              }
            }}
          />
          <datalist id="custom-field-suggestions">
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>
        <div className="flex justify-start">
          <Button type="button" onClick={handleAdd}>
            <Plus className="h-4 w-4" />
            Add field
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

type TemplatePreviewBadgeProps = {
  column: string;
  removable?: boolean;
  onRemove?: () => void;
  label?: string;
};

function TemplatePreviewBadge({
  column,
  removable = false,
  onRemove,
  label,
}: TemplatePreviewBadgeProps) {
  if (!removable) {
    return (
      <Badge variant="outline" className="rounded-full px-3 py-1">
        {label ?? column}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1 rounded-full px-3 py-1">
      <span>{label ?? column}</span>
      <button
        type="button"
        aria-label={`Remove ${label ?? column}`}
        className="rounded-full p-0.5 transition-colors hover:bg-background/80"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

export function StudyOnboardingWizard() {
  const params = useParams();
  const studyId = parseStudyId(params.studyId);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeStep = useMemo(() => parseStep(searchParams.get("step")), [searchParams]);
  const queryClient = useQueryClient();

  const [templateDownloadError, setTemplateDownloadError] = useState<string | null>(null);
  const [onboardingSaveError, setOnboardingSaveError] = useState<string | null>(null);
  const [onboardingFinalizeError, setOnboardingFinalizeError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [draft, setDraft] = useState<OnboardingDraftV6 | null>(() => {
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

  const lookupsQuery = useQuery({
    queryKey: ["lookups"],
    queryFn: fetchLookups,
  });

  function updateDraft(updater: (current: OnboardingDraftV6) => OnboardingDraftV6) {
    setDraft((current) => (current ? updater(current) : current));
  }

  useEffect(() => {
    if (!studyQuery.data) {
      return;
    }
    updateDraft((current) => ({
      ...current,
      details: {
        ...current.details,
        title: current.details.title || studyQuery.data.title || "",
        description: current.details.description || studyQuery.data.description || "",
      },
      template: {
        ...current.template,
        species: current.template.species ?? studyQuery.data.species ?? null,
        celltype: current.template.celltype || studyQuery.data.celltype || "",
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyQuery.data?.id]);

  useEffect(() => {
    if (!onboardingStateQuery.data || !draft) {
      return;
    }
    const hasLocalMappings =
      Boolean(draft.mappings.treatment_level_1) ||
      Boolean(draft.mappings.batch) ||
      draft.mappings.selected_contrasts.length > 0;
    const hasLocalTemplateContext = !isTemplateContextEmpty(draft.template.context);

    updateDraft((current) => ({
      ...current,
      template: {
        ...current.template,
        context: hasLocalTemplateContext ? current.template.context : onboardingStateQuery.data.template_context,
      },
      upload: {
        ...current.upload,
        metadataColumns: current.upload.metadataColumns.length
          ? current.upload.metadataColumns
          : onboardingStateQuery.data.metadata_columns,
        suggestedContrasts: current.upload.suggestedContrasts.length
          ? current.upload.suggestedContrasts
          : onboardingStateQuery.data.suggested_contrasts,
      },
      mappings: hasLocalMappings
        ? current.mappings
        : {
            ...current.mappings,
            ...onboardingStateQuery.data.mappings,
            selected_contrasts: onboardingStateQuery.data.selected_contrasts ?? [],
          },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingStateQuery.data?.updated_at]);

  const saveOnboardingDraftMutation = useMutation({
    mutationFn: async (payload: {
      mappings?: StudyOnboardingMappings;
      selected_contrasts?: ContrastPair[];
      template_context?: StudyTemplateContext;
    }) => patchStudyOnboardingState(studyId as number, payload),
    onSuccess: async (result) => {
      setOnboardingSaveError(null);
      queryClient.setQueryData(["study-onboarding-state", studyId], result);
    },
    onError: (error) => {
      setOnboardingSaveError(error instanceof Error ? error.message : "Unable to save onboarding draft.");
    },
  });

  const saveStudyDetailsMutation = useMutation({
    mutationFn: async () =>
      updateStudy(studyId as number, {
        title: draft?.details.title.trim() || studyQuery.data?.title || "",
        description: draft?.details.description.trim() || studyQuery.data?.description || "",
        species: draft?.template.species ?? studyQuery.data?.species ?? null,
        celltype: draft?.template.celltype.trim() || studyQuery.data?.celltype || null,
      }),
    onSuccess: async (result) => {
      setOnboardingSaveError(null);
      queryClient.setQueryData(["study", studyId], result);
      await queryClient.invalidateQueries({ queryKey: ["study", studyId] });
    },
    onError: (error) => {
      setOnboardingSaveError(error instanceof Error ? error.message : "Unable to save study details.");
    },
  });

  const finalizeOnboardingMutation = useMutation({
    mutationFn: async () => {
      await saveStudyDetailsMutation.mutateAsync();
      return finalizeStudyOnboardingState(studyId as number);
    },
    onSuccess: async (result) => {
      setOnboardingFinalizeError(null);
      queryClient.setQueryData(["study-onboarding-state", studyId], result);
      await queryClient.invalidateQueries({ queryKey: ["study", studyId] });
    },
    onError: (error) => {
      setOnboardingFinalizeError(
        error instanceof Error ? error.message : "Unable to finalize onboarding mappings.",
      );
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

  if (studyId === null) {
    return <p className="error-text">Invalid study ID.</p>;
  }

  if (!draft) {
    return <p>Loading onboarding draft...</p>;
  }

  const fieldDefinitions = lookupsQuery.data?.metadata_field_definitions ?? [];
  const requiredFields = fieldDefinitions.filter((field) => field.required);
  const optionalStandardFields = fieldDefinitions.filter(
    (field) => !field.required && (field.kind === "standard" || STANDARD_UI_FIELD_KEYS.has(field.key)),
  );
  const optionalCustomFields = fieldDefinitions.filter(
    (field) => !field.required && field.kind === "custom" && !STANDARD_UI_FIELD_KEYS.has(field.key),
  );
  const fieldDefinitionsByKey = new Map(fieldDefinitions.map((field) => [field.key, field]));
  const metadataColumnSuggestions = normalizeValueList([
    ...fieldDefinitions.map((field) => field.key),
    ...draft.upload.metadataColumns,
  ]);

  const derivedOptionalFieldKeys = getDerivedOptionalFieldKeys(draft.template.context, fieldDefinitions);
  const effectiveOptionalFieldKeys = normalizeValueList([
    ...derivedOptionalFieldKeys,
    ...draft.template.context.optional_field_keys,
  ]);
  const stagedColumnsFallback = normalizeValueList([
    ...requiredFields.map((field) => field.key),
    ...effectiveOptionalFieldKeys,
    ...draft.template.context.custom_field_keys,
  ]);

  const templatePreviewQuery = useQuery({
    queryKey: [
      "metadata-template-preview",
      studyId,
      draft.template.context.study_design_elements,
      draft.template.context.treatment_vars,
      draft.template.context.batch_vars,
      draft.template.context.optional_field_keys,
      draft.template.context.custom_field_keys,
    ],
    queryFn: () =>
      previewMetadataTemplate({
        study_id: studyId,
        optional_field_keys: draft.template.context.optional_field_keys,
        custom_field_keys: draft.template.context.custom_field_keys,
        template_context: draft.template.context,
      }),
    enabled: studyId !== null && !!lookupsQuery.data,
  });

  const stagedColumns = templatePreviewQuery.data?.columns ?? stagedColumnsFallback;
  const metadataColumns =
    draft.upload.metadataColumns.length > 0
      ? draft.upload.metadataColumns
      : onboardingStateQuery.data?.metadata_columns ?? [];
  const suggestedContrasts =
    draft.upload.suggestedContrasts.length > 0
      ? draft.upload.suggestedContrasts
      : onboardingStateQuery.data?.suggested_contrasts ?? [];
  const onboardingStatus: StudyOnboardingStatus = onboardingStateQuery.data?.status ?? "draft";
  const batchSelectValue = draft.mappings.batch ? draft.mappings.batch : "__none__";
  const templateContext = draft.template.context;
  const templateStepBlocked =
    templateContext.study_design_elements.length === 0 ||
    (templateContext.study_design_elements.includes("treatment") && templateContext.treatment_vars.length === 0) ||
    (templateContext.study_design_elements.includes("batch") && templateContext.batch_vars.length === 0);
  const canDownloadTemplate =
    !templateStepBlocked &&
    !templatePreviewQuery.isLoading &&
    !templatePreviewQuery.isError &&
    Boolean(templatePreviewQuery.data);
  const detailsStepComplete =
    draft.details.title.trim().length > 0 &&
    draft.template.species !== null &&
    draft.template.celltype.trim().length > 0;
  const detailsStepSaved =
    draft.details.title.trim() === (studyQuery.data?.title ?? "").trim() &&
    draft.details.description.trim() === (studyQuery.data?.description ?? "").trim() &&
    (draft.template.species ?? null) === (studyQuery.data?.species ?? null) &&
    draft.template.celltype.trim() === (studyQuery.data?.celltype ?? "").trim();
  const templateStepSaved = areTemplateContextsEqual(
    draft.template.context,
    onboardingStateQuery.data?.template_context ?? createEmptyTemplateContext(),
  );
  const uploadStepComplete = metadataColumns.length > 0;
  const uploadStepSaved = uploadStepComplete;
  const mappingsStepComplete = draft.mappings.treatment_level_1.trim().length > 0;
  const mappingsStepSaved = areMappingsEqual(
    draft.mappings,
    onboardingStateQuery.data?.mappings ?? {
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
    },
    onboardingStateQuery.data?.selected_contrasts ?? [],
  );
  const markStepAttempted = (stepKey: OnboardingStepKey) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const next = {
        ...current,
        attempts: {
          ...current.attempts,
          [stepKey]: true,
        },
      };
      saveDraft({ ...next, updatedAt: new Date().toISOString() });
      return next;
    });
  };
  const sequencingFieldKeySet = new Set<string>(SEQUENCING_FIELD_KEYS);
  const sequencingFields = optionalStandardFields.filter((field) => sequencingFieldKeySet.has(field.key));
  const additionalStandardFields = optionalStandardFields.filter((field) => !sequencingFieldKeySet.has(field.key));
  const additionalStandardGroups = additionalStandardFields.reduce<Record<string, MetadataFieldDefinition[]>>(
    (acc, field) => {
      const group = field.group || "Other";
      acc[group] = acc[group] ? [...acc[group], field] : [field];
      return acc;
    },
    {},
  );
  const selectedCustomFieldKeys = draft.template.context.custom_field_keys;
  const selectedOptionalFieldKeySet = new Set(draft.template.context.optional_field_keys);
  const selectedCustomFieldKeySet = new Set(draft.template.context.custom_field_keys);

  async function persistTemplateContext() {
    await saveOnboardingDraftMutation.mutateAsync({
      template_context: draft.template.context,
    });
  }

  async function persistCurrentStep(stepKey: OnboardingStepKey) {
    setOnboardingSaveError(null);
    if (stepKey === "details") {
      await saveStudyDetailsMutation.mutateAsync();
      markStepAttempted(stepKey);
      return;
    }
    if (stepKey === "template") {
      await persistTemplateContext();
      markStepAttempted(stepKey);
      return;
    }
    if (stepKey === "mappings") {
      const { selected_contrasts, ...mappingsPayload } = draft.mappings;
      await saveOnboardingDraftMutation.mutateAsync({
        mappings: mappingsPayload,
        selected_contrasts,
        template_context: draft.template.context,
      });
      markStepAttempted(stepKey);
    }
  }

  async function handleStepSelection(stepKey: OnboardingStepKey) {
    if (stepKey === activeStep) {
      return;
    }
    try {
      await persistCurrentStep(activeStep);
      goToStep(stepKey);
    } catch {
      // mutation handlers surface errors
    }
  }

  const stepStates = steps.map((step) => {
    if (step.key === "details") {
      return {
        isSaved: detailsStepSaved,
        isComplete: detailsStepComplete,
        isAttempted: Boolean(draft.attempts.details),
      };
    }
    if (step.key === "template") {
      return {
        isSaved: templateStepSaved,
        isComplete: !templateStepBlocked,
        isAttempted: Boolean(draft.attempts.template),
      };
    }
    if (step.key === "upload") {
      return {
        isSaved: uploadStepSaved,
        isComplete: uploadStepComplete,
        isAttempted: Boolean(draft.attempts.upload),
      };
    }
    if (step.key === "mappings") {
      return {
        isSaved: mappingsStepSaved,
        isComplete: mappingsStepComplete,
        isAttempted: Boolean(draft.attempts.mappings),
      };
    }
    return {
      isSaved: onboardingStatus === "final",
      isComplete: onboardingStatus === "final",
      isAttempted: Boolean(draft.attempts.review),
    };
  });

  async function handleContinue() {
    if (!nextStep) {
      return;
    }

    try {
      await persistCurrentStep(activeStep);
      goToStep(nextStep);
    } catch {
      return;
    }
  }

  const topLevelErrorMessage = onboardingFinalizeError || onboardingSaveError || templateDownloadError || generationError;

  return (
    <section className="space-y-5">
      <div className="section-header">
        <div className="min-w-0">
          <p className="eyebrow">Metadata onboarding</p>
          <h2 className="truncate">{studyQuery.data?.title ?? "Study onboarding"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the experimental design, download the matching template, upload it back, and finalize the primary mappings.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="space-y-6 border-b bg-muted/10">
          <nav aria-label="Onboarding steps" className="grid grid-cols-5 gap-3">
            {steps.map((step, index) => {
              const state = stepStates[index];
              const isComplete = state.isSaved && state.isComplete;
              const hasWarning = state.isAttempted && state.isSaved && !state.isComplete;
              const isActive = step.key === activeStep;
              return (
                <button
                  key={step.key}
                  type="button"
                  className="group relative flex min-w-0 flex-col items-center text-center"
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => {
                    void handleStepSelection(step.key);
                  }}
                >
                  {index < steps.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={[
                        "absolute left-[calc(50%+1.5rem)] top-5 hidden h-px w-[calc(100%-3rem)] md:block",
                        isComplete ? "bg-primary/50" : "bg-border/80",
                      ].join(" ")}
                    />
                  ) : null}
                  <span
                    className={[
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                      isComplete ? "border-primary bg-primary text-primary-foreground" : "",
                      hasWarning ? "border-amber-500 bg-amber-50 text-amber-700" : "",
                      isActive && !isComplete && !hasWarning ? "border-foreground bg-background text-foreground shadow-sm" : "",
                      !isComplete && !hasWarning && !isActive ? "border-border bg-background text-muted-foreground group-hover:border-foreground/40" : "",
                    ].join(" ")}
                  >
                    {isComplete ? <Check className="h-4 w-4" /> : null}
                    {!isComplete ? index + 1 : null}
                  </span>
                  <span className="min-w-0 pt-2">
                    <span
                      className={[
                        "block text-sm font-medium",
                        hasWarning ? "text-amber-700" : "text-foreground",
                      ].join(" ")}
                    >
                      {step.title}
                    </span>
                    <span
                      className={[
                        "mt-1 flex items-center justify-center gap-1 text-xs",
                        hasWarning ? "text-amber-700" : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {isComplete ? "Complete and saved" : null}
                      {hasWarning ? <AlertCircle className="h-3 w-3" aria-hidden="true" /> : null}
                      {hasWarning ? "Saved, needs more info" : null}
                      {!isComplete && !hasWarning && isActive ? "In progress" : null}
                      {!isComplete && !hasWarning && !isActive ? "Not started" : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="space-y-1">
            <CardTitle className="text-xl">{steps[activeIndex]?.title}</CardTitle>
            <CardDescription>{steps[activeIndex]?.description}</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 p-6">
          {topLevelErrorMessage ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-medium text-destructive">{topLevelErrorMessage}</p>
            </div>
          ) : null}

          {activeStep === "details" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="studyTitle">Study title</Label>
                <Input
                  id="studyTitle"
                  value={draft.details.title}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      details: { ...current.details, title: event.target.value },
                    }))
                  }
                />
              </div>

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
              </div>

              <div className="grid gap-2">
                <Label htmlFor="studySpecies">Species</Label>
                <Select
                  value={draft.template.species ?? "__none__"}
                  onValueChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      template: {
                        ...current.template,
                        species: value === "__none__" ? null : (value as Study["species"]),
                      },
                    }))
                  }
                >
                  <SelectTrigger id="studySpecies" aria-label="Species">
                    <SelectValue placeholder="Select a species" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select a species</SelectItem>
                    <SelectItem value="human">Human</SelectItem>
                    <SelectItem value="mouse">Mouse</SelectItem>
                    <SelectItem value="rat">Rat</SelectItem>
                    <SelectItem value="hamster">Hamster</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="studyCelltype">Cell type</Label>
                <Input
                  id="studyCelltype"
                  value={draft.template.celltype}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      template: { ...current.template, celltype: event.target.value },
                    }))
                  }
                />
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
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
            </div>
          ) : null}

          {activeStep === "template" ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:grid-rows-[auto_auto]">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">Template preview</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review the generated metadata columns before downloading the sheet.
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 lg:items-end">
                    <Button
                      type="button"
                      disabled={!canDownloadTemplate}
                      onClick={async () => {
                        setTemplateDownloadError(null);
                        try {
                          await persistTemplateContext();
                          markStepAttempted("template");
                          const { blob, filename } = await downloadMetadataTemplate({
                            study_id: studyId,
                            optional_field_keys: draft.template.context.optional_field_keys,
                            custom_field_keys: draft.template.context.custom_field_keys,
                            template_context: draft.template.context,
                          });
                          const url = URL.createObjectURL(blob);
                          const anchor = document.createElement("a");
                          anchor.href = url;
                          anchor.download =
                            filename ?? templatePreviewQuery.data?.filename ?? "metadata.csv";
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
                      <p className="max-w-full text-xs text-muted-foreground lg:text-right">
                        {templatePreviewQuery.data.filename}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-0 lg:row-start-2">
                    {templatePreviewQuery.isLoading ? (
                      <p className="text-muted-foreground">Building template preview…</p>
                    ) : templatePreviewQuery.isError ? (
                      <p className="text-destructive">Template preview failed.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap gap-2">
                          {stagedColumns.map((column) => {
                            const field = fieldDefinitionsByKey.get(column);
                            const isRequired = requiredFields.some((requiredField) => requiredField.key === column);
                            const isDerived = derivedOptionalFieldKeys.includes(column);
                            const isSelectedOptional = selectedOptionalFieldKeySet.has(column);
                            const isSelectedCustom = selectedCustomFieldKeySet.has(column);
                            const removable = !isRequired && !isDerived && (isSelectedOptional || isSelectedCustom);

                            return (
                              <TemplatePreviewBadge
                                key={column}
                                column={column}
                                label={field?.label ?? column}
                                removable={removable}
                                onRemove={
                                  removable
                                    ? () =>
                                        updateDraft((current) => ({
                                          ...current,
                                          template: {
                                            ...current.template,
                                            context: {
                                              ...current.template.context,
                                              optional_field_keys: current.template.context.optional_field_keys.filter(
                                                (key) => key !== column,
                                              ),
                                              custom_field_keys: current.template.context.custom_field_keys.filter(
                                                (key) => key !== column,
                                              ),
                                            },
                                          },
                                        }))
                                    : undefined
                                }
                              />
                            );
                          })}
                        </div>

                        {templatePreviewQuery.data?.auto_included.length ? (
                          <div className="flex flex-col gap-1">
                            {templatePreviewQuery.data.auto_included.map((item) => (
                              <p key={`${item.key}:${item.reason}`} className="text-xs text-muted-foreground">
                                Auto-added {item.key}: {item.reason}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="min-h-0 lg:row-start-2 lg:flex lg:justify-end">
                    {templateStepBlocked ? (
                      <p className="max-w-sm text-sm font-medium text-destructive lg:text-right">
                        Select at least one study design element. Treatment and batch choices also require at least one chip value before download.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">Study design elements</p>
                      <Badge variant="outline">Required</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Users must choose at least one design element so the downloaded template only contains relevant columns.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {STUDY_DESIGN_OPTIONS.map((option) => {
                      const selected = templateContext.study_design_elements.includes(option.key);
                      return (
                        <button
                          key={option.key}
                          type="button"
                          className={[
                            "rounded-xl border px-4 py-3 text-left transition-colors",
                            selected
                              ? "border-foreground bg-background shadow-sm"
                              : "border-border bg-background/70 hover:border-foreground/40",
                          ].join(" ")}
                          onClick={() =>
                            updateDraft((current) => ({
                              ...current,
                              template: {
                                ...current.template,
                                context: {
                                  ...current.template.context,
                                  study_design_elements: toggleValue(
                                    current.template.context.study_design_elements,
                                    option.key,
                                  ),
                                },
                              },
                            }))
                          }
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={[
                                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background text-transparent",
                              ].join(" ")}
                              aria-hidden="true"
                            >
                              <Check className="h-3 w-3" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-base font-medium leading-tight text-foreground">{option.label}</p>
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">{option.description}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Template columns</p>
                    <p className="text-xs text-muted-foreground">
                      Keep the template compact by selecting only the fields the study needs. Auto-included columns stay locked.
                    </p>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)] xl:items-start">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Required</p>
                        <div className="grid gap-2">
                          {requiredFields.map((field) => {
                            const checkboxId = `required-${field.key}`;
                            return (
                              <div key={field.key} className="flex items-start gap-3 rounded-xl border border-border/70 bg-background p-3">
                                <Checkbox
                                  id={checkboxId}
                                  data-testid={`required-field-checkbox-${field.key}`}
                                  aria-label={field.label}
                                  checked
                                  disabled
                                />

                                <div className="min-w-0">
                                  <Label htmlFor={checkboxId} className="cursor-pointer text-sm font-medium text-foreground">
                                    {field.label}
                                  </Label>
                                  <p className="text-xs text-muted-foreground">
                                    {FIELD_DESCRIPTION_OVERRIDES[field.key] ?? (field.description ? field.description : field.key)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {sequencingFields.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sequencing</p>
                          <div className="grid gap-2">
                            {sequencingFields.map((field) => (
                              <TemplateFieldOption
                                key={field.key}
                                field={field}
                                selected={effectiveOptionalFieldKeys.includes(field.key)}
                                locked={derivedOptionalFieldKeys.includes(field.key)}
                                onCheckedChange={(checked) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    template: {
                                      ...current.template,
                                      context: {
                                        ...current.template.context,
                                        optional_field_keys: checked
                                          ? normalizeValueList([
                                              ...current.template.context.optional_field_keys,
                                              field.key,
                                            ])
                                          : current.template.context.optional_field_keys.filter((key) => key !== field.key),
                                      },
                                    },
                                  }))
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      {templateContext.study_design_elements.includes("treatment") ? (
                        <ChipSelectOrAdd
                          inputId="treatment-vars"
                          label="Treatment vars"
                          description="Choose one or more treatment descriptors to carry through onboarding and compatibility summaries."
                          values={templateContext.treatment_vars}
                          suggestions={metadataColumnSuggestions}
                          addLabel="Add a treatment variable"
                          required
                          onChange={(values) =>
                            updateDraft((current) => ({
                              ...current,
                              template: {
                                ...current.template,
                                context: { ...current.template.context, treatment_vars: values },
                              },
                            }))
                          }
                        />
                      ) : null}

                      {templateContext.study_design_elements.includes("batch") ? (
                        <ChipSelectOrAdd
                          inputId="batch-vars"
                          label="Batch vars"
                          description="Choose one or more batch descriptors to preserve in onboarding context and summaries."
                          values={templateContext.batch_vars}
                          suggestions={metadataColumnSuggestions}
                          addLabel="Add a batch variable"
                          required
                          onChange={(values) =>
                            updateDraft((current) => ({
                              ...current,
                              template: {
                                ...current.template,
                                context: { ...current.template.context, batch_vars: values },
                              },
                            }))
                          }
                        />
                      ) : null}

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Additional standard fields</p>
                        <div className="grid gap-2 md:grid-cols-2">
                          {Object.values(additionalStandardGroups)
                            .flat()
                            .map((field) => (
                              <TemplateFieldOption
                                key={field.key}
                                field={field}
                                selected={effectiveOptionalFieldKeys.includes(field.key)}
                                locked={derivedOptionalFieldKeys.includes(field.key)}
                                onCheckedChange={(checked) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    template: {
                                      ...current.template,
                                      context: {
                                        ...current.template.context,
                                        optional_field_keys: checked
                                          ? normalizeValueList([
                                              ...current.template.context.optional_field_keys,
                                              field.key,
                                            ])
                                          : current.template.context.optional_field_keys.filter((key) => key !== field.key),
                                      },
                                    },
                                  }))
                                }
                              />
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Custom additions</p>
                      <p className="text-xs text-muted-foreground">
                        Use common study-specific fields when they exist, or add your own only when needed.
                      </p>
                    </div>

                    {optionalCustomFields.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {optionalCustomFields.map((field) => {
                          const selected =
                            templateContext.custom_field_keys.includes(field.key) ||
                            derivedOptionalFieldKeys.includes(field.key);
                          const locked = derivedOptionalFieldKeys.includes(field.key);
                          return (
                            <button
                              key={field.key}
                              type="button"
                              disabled={locked}
                              className={[
                                "rounded-full border px-3 py-1 text-sm transition-colors",
                                selected ? "border-foreground bg-background text-foreground" : "",
                                !selected ? "border-border bg-background/70 text-muted-foreground hover:border-foreground/40" : "",
                                locked ? "cursor-not-allowed opacity-70" : "",
                              ].join(" ")}
                              onClick={() =>
                                updateDraft((current) => ({
                                  ...current,
                                  template: {
                                    ...current.template,
                                    context: {
                                      ...current.template.context,
                                      custom_field_keys: selected
                                        ? current.template.context.custom_field_keys.filter((key) => key !== field.key)
                                        : normalizeValueList([
                                            ...current.template.context.custom_field_keys,
                                            field.key,
                                          ]),
                                    },
                                  },
                                }))
                              }
                            >
                              {field.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    <CustomFieldAdder
                      suggestions={metadataColumnSuggestions}
                      existingValues={templateContext.custom_field_keys}
                      onAdd={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          template: {
                            ...current.template,
                            context: {
                              ...current.template.context,
                              custom_field_keys: normalizeValueList([
                                ...current.template.context.custom_field_keys,
                                value,
                              ]),
                            },
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeStep === "upload" ? (
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
                      selected_contrasts: shouldDefaultSelected
                        ? nextSuggested
                        : current.mappings.selected_contrasts,
                    },
                  };
                });

                queryClient.invalidateQueries({ queryKey: ["study-onboarding-state", studyId] });
              }}
            />
          ) : null}

          {activeStep === "mappings" ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-sm font-medium text-foreground">Template context</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {templateContext.study_design_elements.map((item) => (
                      <Badge key={item} variant="outline" className="rounded-full px-3 py-1">
                        {item}
                      </Badge>
                    ))}
                    {templateContext.study_design_elements.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No study design elements saved yet.</p>
                    ) : null}
                  </div>
                </div>

                {metadataColumns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Upload and validate a metadata file before selecting mapping columns.
                  </p>
                ) : (
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="treatment_level_1">Treatment level 1 (required)</Label>
                      <Select
                        value={draft.mappings.treatment_level_1 || "__none__"}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            mappings: {
                              ...current.mappings,
                              treatment_level_1: value === "__none__" ? "" : value,
                            },
                          }))
                        }
                      >
                        <SelectTrigger id="treatment_level_1" aria-label="Treatment level 1">
                          <SelectValue placeholder="Select a metadata column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select a metadata column</SelectItem>
                          {metadataColumns.map((column) => (
                            <SelectItem key={column} value={column}>
                              {column}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {(
                        [
                          ["treatment_level_2", "Treatment level 2"],
                          ["treatment_level_3", "Treatment level 3"],
                          ["treatment_level_4", "Treatment level 4"],
                          ["treatment_level_5", "Treatment level 5"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="space-y-2">
                          <Label htmlFor={key}>{label}</Label>
                          <Select
                            value={draft.mappings[key] ? draft.mappings[key] : "__none__"}
                            onValueChange={(value) =>
                              updateDraft((current) => ({
                                ...current,
                                mappings: {
                                  ...current.mappings,
                                  [key]: value === "__none__" ? "" : value,
                                },
                              }))
                            }
                          >
                            <SelectTrigger id={key} aria-label={label}>
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
                      ))}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="batch">Primary batch column</Label>
                      <Select
                        value={batchSelectValue}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            mappings: { ...current.mappings, batch: value === "__none__" ? "" : value },
                          }))
                        }
                      >
                        <SelectTrigger id="batch" aria-label="Batch">
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

                    <div className="grid gap-4 sm:grid-cols-2">
                      {(
                        [
                          ["pca_color", "PCA color"],
                          ["pca_shape", "PCA shape"],
                          ["pca_alpha", "PCA alpha"],
                          ["clustering_group", "Clustering group"],
                          ["report_faceting_group", "Report faceting group"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="space-y-2">
                          <Label htmlFor={key}>{label}</Label>
                          <Select
                            value={draft.mappings[key] ? draft.mappings[key] : "__none__"}
                            onValueChange={(value) =>
                              updateDraft((current) => ({
                                ...current,
                                mappings: {
                                  ...current.mappings,
                                  [key]: value === "__none__" ? "" : value,
                                },
                              }))
                            }
                          >
                            <SelectTrigger id={key} aria-label={label}>
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
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saveOnboardingDraftMutation.isPending}
                    onClick={() => {
                      const { selected_contrasts, ...mappingsPayload } = draft.mappings;
                      setOnboardingSaveError(null);
                      saveOnboardingDraftMutation.mutate(
                        {
                          mappings: mappingsPayload,
                          selected_contrasts,
                          template_context: draft.template.context,
                        },
                        {
                          onSuccess: () => {
                            markStepAttempted("mappings");
                          },
                        },
                      );
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
                          template_context: draft.template.context,
                        });
                        markStepAttempted("mappings");
                        await finalizeOnboardingMutation.mutateAsync();
                      } catch {
                        // mutation handlers surface errors
                      }
                    }}
                  >
                    {finalizeOnboardingMutation.isPending ? "Finalizing…" : "Finalize mappings"}
                  </Button>
                </div>
                {saveStudyDetailsMutation.isPending || saveOnboardingDraftMutation.isPending ? (
                  <p className="text-sm text-muted-foreground">Saving changes before moving on…</p>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
                  <p className="font-medium text-foreground">Suggested contrasts</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Derived from uploaded metadata columns `group` and `solvent_control`.
                  </p>

                  {suggestedContrasts.length === 0 ? (
                    <p className="mt-3 text-muted-foreground">No contrast suggestions available yet.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
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
                                          selected_contrasts: alreadySelected
                                            ? currentPairs
                                            : [...currentPairs, pair],
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
          ) : null}

          {activeStep === "review" ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="font-medium text-foreground">Summary</p>
                <ul className="mt-3 space-y-2 text-muted-foreground">
                  <li>Title: {draft.details.title || "—"}</li>
                  <li>PI: {draft.details.piName || "—"}</li>
                  <li>Researcher: {draft.details.researcherName || "—"}</li>
                  <li>Species: {draft.template.species || "—"}</li>
                  <li>Cell type: {draft.template.celltype || "—"}</li>
                  <li>Study design: {templateContext.study_design_elements.join(", ") || "—"}</li>
                  <li>Treatment variables: {templateContext.treatment_vars.join(", ") || "—"}</li>
                  <li>Batch variables: {templateContext.batch_vars.join(", ") || "—"}</li>
                  <li>Template columns: {stagedColumns.join(", ") || "—"}</li>
                  <li>Upload: {draft.upload.fileName || "—"}</li>
                  <li>Primary treatment mapping: {draft.mappings.treatment_level_1 || "—"}</li>
                  <li>Primary batch mapping: {draft.mappings.batch || "—"}</li>
                  <li>Onboarding status: {onboardingStatus}</li>
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => updateDraft(() => createDefaultDraft(studyId))}>
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
              {onboardingStatus !== "final" ? (
                <p className="text-sm text-muted-foreground">
                  Finalize mappings in the previous step to unblock output generation.
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="justify-between border-t bg-muted/10 p-6">
          <Button
            type="button"
            variant="outline"
            disabled={!prevStep}
            onClick={() => prevStep && goToStep(prevStep)}
          >
            Back
          </Button>
          <Button
            type="button"
            disabled={!nextStep || (activeStep === "template" && templateStepBlocked)}
            onClick={() => {
              void handleContinue();
            }}
          >
            Continue
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
