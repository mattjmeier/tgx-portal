import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, Plus, X } from "lucide-react";

import {
  fetchLookups,
  type LookupOption,
  type LookupValue,
  type MetadataFieldDefinition,
} from "../../api/lookups";
import { downloadMetadataTemplate, previewMetadataTemplate } from "../../api/metadataTemplates";
import { downloadProjectConfig } from "../../api/projects";
import {
  deleteStudy,
  fetchStudy,
  updateStudy,
  type Study,
} from "../../api/studies";
import {
  fetchStudyOnboardingState,
  finalizeStudyOnboardingState,
  patchStudyOnboardingState,
  type ContrastPair,
  type StudyOnboardingGroupBuilder,
  type StudyOnboardingMappings,
  type StudyOnboardingConfig,
  type StudyOnboardingStatus,
  type StudyTemplateContext,
} from "../../api/studyOnboarding";
import { MetadataUploadStep } from "./MetadataUploadStep";
import { MultiSelect } from "../ui/multi-select";
import { StudyDeleteDialog } from "../StudyDeleteDialog";
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
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { cn } from "../../lib/utils";
import { studiesIndexPath } from "../../lib/routes";
import { clearDeletedStudyClientState, onboardingDraftStorageKey } from "../../lib/studyDeletion";

type OnboardingStepKey = "details" | "design" | "metadata" | "upload" | "finalize";

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
  groupBuilder?: StudyOnboardingGroupBuilder;
  config: StudyOnboardingConfig;
  upload: {
    fileName: string;
    metadataColumns: string[];
    suggestedContrasts: ContrastPair[];
  };
  mappings: StudyOnboardingMappings & {
    selected_contrasts: ContrastPair[];
  };
};

type OnboardingDraftV7 = Omit<OnboardingDraftV6, "version"> & {
  version: 7;
};

type OnboardingDraftV8 = Omit<OnboardingDraftV7, "version"> & {
  version: 8;
  groupBuilder: StudyOnboardingGroupBuilder;
  upload: OnboardingDraftV7["upload"] & {
    validatedRows: Array<Record<string, unknown>>;
  };
};

type ExposureLabelMode = StudyTemplateContext["exposure_label_mode"];

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
    key: "exposure",
    label: "Exposure level",
    description: "Include exposure metadata and choose whether it should be labeled as dose, concentration, both, or a custom term.",
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
  timepoint: ["timepoint"],
  treatment: [],
  batch: [],
};

const SEQUENCING_FIELD_KEYS = ["i5_index", "i7_index", "well_id"] as const;
const STANDARD_UI_FIELD_KEYS = new Set<string>(["timepoint"]);
const COMMON_OPTIONAL_FIELD_KEYS = new Set<string>([
  "sample_name",
  "group",
  "chemical",
  "dose",
  "plate",
]);
const EXPOSURE_LABEL_OPTIONS: Array<{
  value: NonNullable<ExposureLabelMode>;
  label: string;
}> = [
  { value: "dose", label: "Dose" },
  { value: "concentration", label: "Concentration" },
  { value: "both", label: "Both / mixed study" },
  { value: "custom", label: "Custom" },
];
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
    key: "design",
    title: "Template design",
    description: "Define the experimental constraints that must be represented in the metadata template.",
  },
  {
    key: "metadata",
    title: "Finalize metadata",
    description: "Preview the generated template and choose optional or custom metadata columns.",
  },
  {
    key: "upload",
    title: "Upload metadata",
    description: "Preview the sheet and validate every issue in one pass before finalizing onboarding.",
  },
  {
    key: "finalize",
    title: "Review & finalize",
    description: "Review the study setup, confirm mappings and contrasts, then finalize onboarding.",
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
  if (value === "template") {
    return "design";
  }
  if (value === "mappings" || value === "review") {
    return "finalize";
  }
  const keys = steps.map((step) => step.key);
  if (value && keys.includes(value as OnboardingStepKey)) {
    return value as OnboardingStepKey;
  }
  return "details";
}

function draftStorageKey(studyId: number) {
  return onboardingDraftStorageKey(studyId);
}

function createEmptyTemplateContext(): StudyTemplateContext {
  return {
    study_design_elements: [],
    exposure_label_mode: null,
    exposure_custom_label: "",
    treatment_vars: [],
    batch_vars: [],
    optional_field_keys: [],
    custom_field_keys: [],
  };
}

function createEmptyGroupBuilder(): StudyOnboardingGroupBuilder {
  return {
    primary_column: "",
    additional_columns: [],
    batch_column: "",
  };
}

function createDefaultDraft(studyId: number): OnboardingDraftV8 {
  return {
    version: 8,
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
    groupBuilder: createEmptyGroupBuilder(),
    config: {
      common: {
        platform: "RNA-Seq",
        instrument_model: "",
        sequenced_by: "",
        biospyder_kit: null,
        dose: null,
        units: "",
      },
      pipeline: {
        mode: "se",
        threads: 8,
      },
      qc: {},
      deseq2: {
        cpus: 4,
      },
    },
    upload: {
      fileName: "",
      metadataColumns: [],
      validatedRows: [],
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

function normalizeExposureCustomLabel(value: string): string {
  return value.trim();
}

function normalizeGroupBuilder(groupBuilder: Partial<StudyOnboardingGroupBuilder> | null | undefined): StudyOnboardingGroupBuilder {
  const primary = String(groupBuilder?.primary_column ?? "").trim();
  const additional = normalizeValueList(groupBuilder?.additional_columns ?? []).filter((value) => value !== primary);
  return {
    primary_column: primary,
    additional_columns: additional,
    batch_column: String(groupBuilder?.batch_column ?? "").trim(),
  };
}

function normalizeTemplateContext(context: Partial<StudyTemplateContext> | null | undefined): StudyTemplateContext {
  const base = createEmptyTemplateContext();
  const rawDesignElements = normalizeValueList(context?.study_design_elements ?? []);
  const hasLegacyDose = rawDesignElements.includes("dose");
  const hasLegacyConcentration = rawDesignElements.includes("concentration");
  let studyDesignElements = rawDesignElements
    .filter((value) => value !== "dose" && value !== "concentration")
    .map((value) => value);
  if (hasLegacyDose || hasLegacyConcentration) {
    studyDesignElements = normalizeValueList([...studyDesignElements, "exposure"]);
  }
  const hasExposure = studyDesignElements.includes("exposure");
  const requestedMode = context?.exposure_label_mode
    ?? (hasLegacyDose && hasLegacyConcentration
      ? "both"
      : hasLegacyConcentration
        ? "concentration"
        : hasLegacyDose
          ? "dose"
          : null);
  const exposureLabelMode: ExposureLabelMode = hasExposure
    ? requestedMode === "concentration" || requestedMode === "both" || requestedMode === "custom" || requestedMode === "dose"
      ? requestedMode
      : "dose"
    : null;
  const exposureCustomLabel = hasExposure && exposureLabelMode === "custom"
    ? normalizeExposureCustomLabel(context?.exposure_custom_label ?? "")
    : "";

  if (!hasExposure) {
    studyDesignElements = studyDesignElements.filter((value) => value !== "exposure");
  }

  return {
    ...base,
    ...context,
    study_design_elements: studyDesignElements,
    exposure_label_mode: exposureLabelMode,
    exposure_custom_label: exposureCustomLabel,
    treatment_vars: normalizeValueList(context?.treatment_vars ?? []),
    batch_vars: normalizeValueList(context?.batch_vars ?? []),
    optional_field_keys: normalizeValueList(context?.optional_field_keys ?? []),
    custom_field_keys: normalizeValueList(context?.custom_field_keys ?? []),
  };
}

function getExposureFieldKeys(context: StudyTemplateContext): string[] {
  if (!context.study_design_elements.includes("exposure")) {
    return [];
  }
  if (context.exposure_label_mode === "concentration") {
    return ["concentration"];
  }
  if (context.exposure_label_mode === "both") {
    return ["dose", "concentration"];
  }
  if (context.exposure_label_mode === "custom" && context.exposure_custom_label) {
    return [context.exposure_custom_label];
  }
  return ["dose"];
}

function getStudyDesignElementLabel(element: string, context: StudyTemplateContext): string {
  if (element !== "exposure") {
    return STUDY_DESIGN_OPTIONS.find((option) => option.key === element)?.label ?? element;
  }
  if (context.exposure_label_mode === "concentration") {
    return "Exposure level (Concentration)";
  }
  if (context.exposure_label_mode === "both") {
    return "Exposure level (Dose + concentration)";
  }
  if (context.exposure_label_mode === "custom" && context.exposure_custom_label) {
    return `Exposure level (${context.exposure_custom_label})`;
  }
  return "Exposure level (Dose)";
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
      context: normalizeTemplateContext({
        treatment_vars: normalizeValueList(draft.template.treatmentVar ? [draft.template.treatmentVar] : []),
        batch_vars: normalizeValueList(draft.template.batchVar ? [draft.template.batchVar] : []),
        optional_field_keys: normalizeValueList(draft.template.optionalFieldKeys),
        custom_field_keys: normalizeValueList(draft.template.customFieldKeys),
      }),
    },
    upload: draft.upload,
    mappings: draft.mappings,
  };
}

function migrateDraftV5ToV6(draft: OnboardingDraftV5): OnboardingDraftV6 {
  const next = createDefaultDraft(draft.studyId);
  return {
    ...next,
    version: 6,
    updatedAt: draft.updatedAt,
    details: draft.details,
    template: {
      ...draft.template,
      context: normalizeTemplateContext(draft.template.context),
    },
    config: next.config,
    upload: {
      ...draft.upload,
      validatedRows: [],
    },
    mappings: draft.mappings,
  };
}

function migrateDraftV6ToV7(draft: OnboardingDraftV6): OnboardingDraftV7 {
  const next = createDefaultDraft(draft.studyId);
  return {
    ...next,
    version: 7,
    updatedAt: draft.updatedAt,
    attempts: draft.attempts,
    details: draft.details,
    template: {
      ...draft.template,
      context: normalizeTemplateContext(draft.template.context),
    },
    groupBuilder: normalizeGroupBuilder(draft.groupBuilder),
    config: draft.config ?? next.config,
    upload: {
      ...draft.upload,
      validatedRows: [],
    },
    mappings: draft.mappings,
  };
}

function migrateDraftV7ToV8(draft: OnboardingDraftV7): OnboardingDraftV8 {
  const next = createDefaultDraft(draft.studyId);
  return {
    ...next,
    version: 8,
    updatedAt: draft.updatedAt,
    attempts: draft.attempts,
    details: draft.details,
    template: {
      ...draft.template,
      context: normalizeTemplateContext(draft.template.context),
    },
    groupBuilder: normalizeGroupBuilder(draft.groupBuilder),
    config: draft.config,
    upload: {
      ...draft.upload,
      validatedRows: [],
    },
    mappings: draft.mappings,
  };
}

function loadDraft(studyId: number): OnboardingDraftV8 {
  const raw = localStorage.getItem(draftStorageKey(studyId));
  if (!raw) {
    return createDefaultDraft(studyId);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return migrateDraftV6ToV7(createDefaultDraft(studyId));
    }
    if ((parsed as { version?: unknown }).version === 8) {
      const draft = parsed as OnboardingDraftV8;
      return {
        ...draft,
        template: {
          ...draft.template,
          context: normalizeTemplateContext(draft.template.context),
        },
        groupBuilder: normalizeGroupBuilder(draft.groupBuilder),
        upload: {
          ...draft.upload,
          validatedRows: draft.upload.validatedRows ?? [],
        },
      };
    }
    if ((parsed as { version?: unknown }).version === 7) {
      return migrateDraftV7ToV8(parsed as OnboardingDraftV7);
    }
    if ((parsed as { version?: unknown }).version === 6) {
      return migrateDraftV7ToV8(migrateDraftV6ToV7(parsed as OnboardingDraftV6));
    }
    if ((parsed as { version?: unknown }).version === 5) {
      return migrateDraftV7ToV8(migrateDraftV6ToV7(migrateDraftV5ToV6(parsed as OnboardingDraftV5)));
    }
    if ((parsed as { version?: unknown }).version === 4) {
      return migrateDraftV7ToV8(migrateDraftV6ToV7(migrateDraftV5ToV6(migrateDraftV4ToV5(parsed as LegacyOnboardingDraftV4))));
    }
  } catch {
    return createDefaultDraft(studyId);
  }

  return createDefaultDraft(studyId);
}

function saveDraft(draft: OnboardingDraftV8) {
  localStorage.setItem(draftStorageKey(draft.studyId), JSON.stringify(draft));
}

function isTemplateContextEmpty(context: StudyTemplateContext): boolean {
  return (
    context.study_design_elements.length === 0 &&
    !context.exposure_label_mode &&
    context.exposure_custom_label.length === 0 &&
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
  for (const key of getExposureFieldKeys(context)) {
    if (available.has(key) && !derived.includes(key)) {
      derived.push(key);
    }
  }
  for (const key of context.treatment_vars) {
    if (available.has(key) && !derived.includes(key)) {
      derived.push(key);
    }
  }
  for (const key of context.batch_vars) {
    if (available.has(key) && !derived.includes(key)) {
      derived.push(key);
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
    left.exposure_label_mode === right.exposure_label_mode &&
    left.exposure_custom_label === right.exposure_custom_label &&
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

function normalizeManagedConfig(config: StudyOnboardingConfig | null | undefined): StudyOnboardingConfig {
  const defaults = createDefaultDraft(0).config;

  return {
    common: {
      ...defaults.common,
      ...(config?.common ?? {}),
    },
    pipeline: {
      ...defaults.pipeline,
      ...(config?.pipeline ?? {}),
    },
    qc: {
      ...defaults.qc,
      ...(config?.qc ?? {}),
    },
    deseq2: {
      ...defaults.deseq2,
      ...(config?.deseq2 ?? {}),
    },
  };
}

function getGroupBuilderColumns(groupBuilder: StudyOnboardingGroupBuilder): string[] {
  return [
    groupBuilder.primary_column,
    ...groupBuilder.additional_columns,
  ].filter((value) => value.trim().length > 0);
}

function normalizeGroupPart(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim().replace(/\s+/g, "_");
}

function buildDerivedGroupRows(
  rows: Array<Record<string, unknown>>,
  groupBuilder: StudyOnboardingGroupBuilder,
): Array<Record<string, unknown> & { group?: string; __group_context?: string }> {
  if (!groupBuilder.primary_column) {
    return rows;
  }

  return rows.map((row) => {
    const groupParts = getGroupBuilderColumns(groupBuilder)
      .map((column) => normalizeGroupPart(row[column]))
      .filter((value) => value.length > 0);
    const context = groupBuilder.additional_columns
      .map((column) => normalizeGroupPart(row[column]))
      .filter((value) => value.length > 0)
      .join("_");

    return {
      ...row,
      ...(groupParts.length > 0 ? { group: groupParts.join("_") } : {}),
      ...(context ? { __group_context: context } : {}),
    };
  });
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "t", "1", "yes", "y"].includes(normalized);
  }
  return false;
}

function suggestContrastsFromRows(rows: Array<Record<string, unknown>>): ContrastPair[] {
  const controlGroupsByContext = new Map<string, Set<string>>();
  const allControls = new Set<string>();
  const experimentalGroups = new Map<string, string>();

  for (const row of rows) {
    const group = String(row.group ?? "").trim();
    if (!group) {
      continue;
    }
    const context = String(row.__group_context ?? "").trim();
    if (normalizeBoolean(row.solvent_control)) {
      const existing = controlGroupsByContext.get(context) ?? new Set<string>();
      existing.add(group);
      controlGroupsByContext.set(context, existing);
      allControls.add(group);
      continue;
    }
    experimentalGroups.set(`${context}::${group}`, context);
  }

  const suggestions: ContrastPair[] = [];
  for (const key of Array.from(experimentalGroups.keys()).sort()) {
    const [context, group] = key.split("::");
    const controls = controlGroupsByContext.get(context) ?? allControls;
    for (const reference of Array.from(controls).sort()) {
      if (reference === group) {
        continue;
      }
      suggestions.push({ reference_group: reference, comparison_group: group });
    }
  }
  return suggestions;
}

function lookupValueLabel(value: LookupValue): string {
  return typeof value === "string" ? value : value.label;
}

function lookupValueId(value: LookupValue): string {
  return typeof value === "string" ? value : value.value;
}

function lookupValueRaw(value: LookupValue): string {
  return typeof value === "string" ? value : value.value;
}

function lookupStringValues(values: LookupValue[] | undefined): string[] {
  return (values ?? []).map((value) => lookupValueRaw(value));
}

function lookupOptions(values: LookupValue[] | undefined): LookupOption[] {
  return (values ?? []).map((value) =>
    typeof value === "string" ? { label: value, value } : value,
  );
}

function withStringFallback(values: string[], fallback: string[]): string[] {
  return values.length > 0 ? values : fallback;
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
        <Button type="button" variant="secondary" aria-label={addLabel} onClick={addCurrentValue}>
          <Plus className="h-4 w-4" />
          {addLabel}
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
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border/70 bg-background p-3">
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
    </div>
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
  const navigate = useNavigate();

  const [templateDownloadError, setTemplateDownloadError] = useState<string | null>(null);
  const [onboardingSaveError, setOnboardingSaveError] = useState<string | null>(null);
  const [onboardingFinalizeError, setOnboardingFinalizeError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [deleteStudyError, setDeleteStudyError] = useState<string | null>(null);

  const [draft, setDraft] = useState<OnboardingDraftV8 | null>(() => {
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

  function updateDraft(updater: (current: OnboardingDraftV8) => OnboardingDraftV8) {
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
    const hasLocalGroupBuilder =
      Boolean(draft.groupBuilder.primary_column) ||
      draft.groupBuilder.additional_columns.length > 0 ||
      Boolean(draft.groupBuilder.batch_column);
    const hasLocalConfig =
      Boolean((draft.config.common.instrument_model as string | undefined)?.toString().trim()) ||
      Boolean((draft.config.common.sequenced_by as string | undefined)?.toString().trim()) ||
      Boolean(draft.config.common.biospyder_kit);

    updateDraft((current) => ({
      ...current,
      template: {
        ...current.template,
        context: hasLocalTemplateContext
          ? normalizeTemplateContext(current.template.context)
          : normalizeTemplateContext(onboardingStateQuery.data.template_context),
      },
      groupBuilder: hasLocalGroupBuilder
        ? normalizeGroupBuilder(current.groupBuilder)
        : normalizeGroupBuilder(onboardingStateQuery.data.group_builder),
      config: hasLocalConfig ? current.config : onboardingStateQuery.data.config,
      upload: {
        ...current.upload,
        metadataColumns: current.upload.metadataColumns.length
          ? current.upload.metadataColumns
          : onboardingStateQuery.data.metadata_columns,
        validatedRows: current.upload.validatedRows.length
          ? current.upload.validatedRows
          : onboardingStateQuery.data.validated_rows,
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
      config?: StudyOnboardingConfig;
      group_builder?: StudyOnboardingGroupBuilder;
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

  const deleteStudyMutation = useMutation<void, Error, number>({
    mutationFn: deleteStudy,
    onSuccess: async (_, deletedStudyId) => {
      setDeleteStudyError(null);
      clearDeletedStudyClientState(queryClient, deletedStudyId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studies"] }),
        queryClient.invalidateQueries({ queryKey: ["studies-index"] }),
        queryClient.invalidateQueries({ queryKey: ["study"] }),
        queryClient.invalidateQueries({ queryKey: ["study-onboarding-state"] }),
      ]);
      navigate(studiesIndexPath);
    },
    onError: (error) => {
      setDeleteStudyError(error instanceof Error ? error.message : "Unable to delete the study.");
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
  const platformOptions = withStringFallback(
    lookupStringValues(lookupsQuery.data?.lookups.controlled.platform.values),
    ["TempO-Seq", "RNA-Seq", "DrugSeq"],
  );
  const instrumentModelOptions = withStringFallback(
    lookupStringValues(lookupsQuery.data?.lookups.controlled.instrument_model.values),
    [],
  );
  const featuredInstrumentModels = lookupsQuery.data?.lookups.featured?.instrument_model ?? [];
  const biospyderKitOptions = lookupOptions(lookupsQuery.data?.lookups.controlled.biospyder_kit.values ?? []);
  const celltypeSuggestions = lookupStringValues(lookupsQuery.data?.lookups.soft.celltype.values ?? []);
  const sequencedBySuggestions = withStringFallback(
    lookupStringValues(lookupsQuery.data?.lookups.soft.sequenced_by.values),
    ["HC Genomics lab", "HC foods lab", "Yauk lab"],
  );
  const requiredFields = fieldDefinitions.filter((field) => field.required);
  const optionalStandardFields = fieldDefinitions.filter(
    (field) => !field.required && (field.kind === "standard" || STANDARD_UI_FIELD_KEYS.has(field.key)),
  );
  const optionalCustomFields = fieldDefinitions
    .filter(
      (field) =>
        !field.required &&
        field.kind === "custom" &&
        field.wizard_featured &&
        !STANDARD_UI_FIELD_KEYS.has(field.key),
    )
    .sort(
      (left, right) =>
        left.wizard_featured_order - right.wizard_featured_order ||
        left.label.localeCompare(right.label) ||
        left.key.localeCompare(right.key),
    );
  const fieldDefinitionsByKey = new Map(fieldDefinitions.map((field) => [field.key, field]));
  const metadataColumnSuggestions = normalizeValueList([
    ...fieldDefinitions.map((field) => field.key),
    ...draft.upload.metadataColumns,
  ]);
  const templateContext = normalizeTemplateContext(draft.template.context);

  const derivedOptionalFieldKeys = getDerivedOptionalFieldKeys(templateContext, fieldDefinitions);
  const effectiveOptionalFieldKeys = normalizeValueList([
    ...derivedOptionalFieldKeys,
    ...templateContext.optional_field_keys,
  ]);
  const stagedColumnsFallback = normalizeValueList([
    ...requiredFields.map((field) => field.key),
    ...getExposureFieldKeys(templateContext),
    ...effectiveOptionalFieldKeys,
    ...templateContext.custom_field_keys,
  ]);

  const templatePreviewQuery = useQuery({
    queryKey: [
      "metadata-template-preview",
      studyId,
      templateContext.study_design_elements,
      templateContext.exposure_label_mode,
      templateContext.exposure_custom_label,
      templateContext.treatment_vars,
      templateContext.batch_vars,
      templateContext.optional_field_keys,
      templateContext.custom_field_keys,
    ],
    queryFn: () =>
      previewMetadataTemplate({
        study_id: studyId,
        optional_field_keys: templateContext.optional_field_keys,
        custom_field_keys: templateContext.custom_field_keys,
        template_context: templateContext,
      }),
    enabled: studyId !== null && !!lookupsQuery.data,
  });

  const stagedColumns = templatePreviewQuery.data?.columns ?? stagedColumnsFallback;
  const templatePreviewErrorMessage =
    templatePreviewQuery.error instanceof Error ? templatePreviewQuery.error.message : "Template preview failed.";
  const metadataColumns =
    draft.upload.metadataColumns.length > 0
      ? draft.upload.metadataColumns
      : onboardingStateQuery.data?.metadata_columns ?? [];
  const validatedRows = (
    draft.upload.validatedRows.length > 0
      ? draft.upload.validatedRows
      : onboardingStateQuery.data?.validated_rows ?? []
  ) as Array<Record<string, unknown>>;
  const groupBuilder = normalizeGroupBuilder(draft.groupBuilder);
  const derivedGroupRows = buildDerivedGroupRows(validatedRows, groupBuilder);
  const derivedMetadataColumns = normalizeValueList([
    ...metadataColumns,
    ...(groupBuilder.primary_column && derivedGroupRows.some((row) => String(row.group ?? "").trim()) ? ["group"] : []),
  ]);
  const previewGroupColumns = normalizeValueList(["sample_ID", ...getGroupBuilderColumns(groupBuilder), "group"]);
  const computedSuggestedContrasts =
    groupBuilder.primary_column && validatedRows.length > 0
      ? suggestContrastsFromRows(derivedGroupRows)
      : (draft.upload.suggestedContrasts.length > 0
        ? draft.upload.suggestedContrasts
        : onboardingStateQuery.data?.suggested_contrasts ?? []);
  const suggestedContrasts = computedSuggestedContrasts;
  const onboardingStatus: StudyOnboardingStatus = onboardingStateQuery.data?.status ?? "draft";
  const defaultTreatmentMapping = groupBuilder.primary_column
    ? "group"
    : (templateContext.treatment_vars[0] && derivedMetadataColumns.includes(templateContext.treatment_vars[0])
      ? templateContext.treatment_vars[0]
      : "");
  const defaultBatchMapping =
    groupBuilder.batch_column && derivedMetadataColumns.includes(groupBuilder.batch_column)
      ? groupBuilder.batch_column
      : (templateContext.batch_vars[0] && derivedMetadataColumns.includes(templateContext.batch_vars[0])
        ? templateContext.batch_vars[0]
        : "");
  const effectivePrimaryTreatmentMapping = draft.mappings.treatment_level_1 || defaultTreatmentMapping;
  const effectivePrimaryBatchMapping = draft.mappings.batch || defaultBatchMapping;
  const additionalTreatmentMappings = groupBuilder.additional_columns;
  const finalizeTemplateContext = normalizeTemplateContext({
    ...templateContext,
    treatment_vars: groupBuilder.primary_column ? ["group"] : templateContext.treatment_vars,
    batch_vars: groupBuilder.batch_column ? [groupBuilder.batch_column] : templateContext.batch_vars,
    optional_field_keys: normalizeValueList([
      ...templateContext.optional_field_keys,
      ...(groupBuilder.primary_column ? ["group"] : []),
    ]),
  });
  const designStepBlocked =
    templateContext.study_design_elements.length === 0 ||
    (templateContext.study_design_elements.includes("exposure") &&
      templateContext.exposure_label_mode === "custom" &&
      templateContext.exposure_custom_label.length === 0) ||
    (templateContext.study_design_elements.includes("treatment") && templateContext.treatment_vars.length === 0) ||
    (templateContext.study_design_elements.includes("batch") && templateContext.batch_vars.length === 0);
  const canDownloadTemplate =
    !designStepBlocked &&
    !templatePreviewQuery.isLoading &&
    !templatePreviewQuery.isError &&
    Boolean(templatePreviewQuery.data);
  const detailsStepComplete =
    draft.details.title.trim().length > 0 &&
    draft.template.species !== null &&
    draft.template.celltype.trim().length > 0 &&
    String(draft.config.common.platform ?? "").trim().length > 0 &&
    String(draft.config.common.instrument_model ?? "").trim().length > 0 &&
    String(draft.config.common.sequenced_by ?? "").trim().length > 0 &&
    String(draft.config.pipeline.mode ?? "").trim().length > 0 &&
    (draft.config.common.platform !== "TempO-Seq" || Boolean(draft.config.common.biospyder_kit));
  const detailsStepSaved =
    draft.details.title.trim() === (studyQuery.data?.title ?? "").trim() &&
    draft.details.description.trim() === (studyQuery.data?.description ?? "").trim() &&
    (draft.template.species ?? null) === (studyQuery.data?.species ?? null) &&
    draft.template.celltype.trim() === (studyQuery.data?.celltype ?? "").trim() &&
    JSON.stringify(normalizeManagedConfig(draft.config)) === JSON.stringify(normalizeManagedConfig(onboardingStateQuery.data?.config));
  const templateStepSaved = areTemplateContextsEqual(
    templateContext,
    normalizeTemplateContext(onboardingStateQuery.data?.template_context ?? createEmptyTemplateContext()),
  );
  const uploadStepComplete = metadataColumns.length > 0 && validatedRows.length > 0;
  const uploadStepSaved = uploadStepComplete;
  const mappingsStepComplete = effectivePrimaryTreatmentMapping.trim().length > 0;
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
  const metadataStepComplete = canDownloadTemplate;
  const metadataStepSaved = templateStepSaved;
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
  const commonFieldKeys = new Set<string>([
    ...Array.from(COMMON_OPTIONAL_FIELD_KEYS),
    ...derivedOptionalFieldKeys,
  ]);
  const commonFields = optionalStandardFields.filter(
    (field) => !sequencingFieldKeySet.has(field.key) && commonFieldKeys.has(field.key),
  );
  const selectedCustomFieldKeys = templateContext.custom_field_keys;
  const selectedOptionalFieldKeySet = new Set(templateContext.optional_field_keys);
  const selectedCustomFieldKeySet = new Set(templateContext.custom_field_keys);
  const selectedPlatform = String(draft.config.common.platform ?? "");
  const selectedMode = String(draft.config.pipeline.mode ?? "");
  const selectedInstrumentModel = String(draft.config.common.instrument_model ?? "");
  const selectedSequencedBy = String(draft.config.common.sequenced_by ?? "");
  const selectedBiospyderKit = draft.config.common.biospyder_kit;
  const reviewWarnings = [
    metadataColumns.length === 0 ? "Upload and validate metadata before generating the handoff bundle." : null,
    !groupBuilder.primary_column && !metadataColumns.includes("group")
      ? "Choose at least one grouping variable to generate analysis groups."
      : null,
    groupBuilder.primary_column && suggestedContrasts.length === 0
      ? "No control groups could be identified from solvent_control."
      : null,
    finalizeTemplateContext.study_design_elements.includes("batch") && !effectivePrimaryBatchMapping
      ? "Batch was marked as part of the study design, but no batch column is resolved yet."
      : null,
  ].filter((message): message is string => Boolean(message));

  useEffect(() => {
    const availableColumns = new Set(derivedMetadataColumns);
    const suggestedPrimary = metadataColumns.includes("group")
      ? "group"
      : ["chemical", "dose", "concentration", "timepoint"].find((column) => metadataColumns.includes(column)) ?? "";
    const nextBatch = groupBuilder.batch_column || (templateContext.batch_vars[0] ?? "");

    if (!draft.groupBuilder.primary_column && suggestedPrimary) {
      updateDraft((current) => ({
        ...current,
        groupBuilder: {
          ...current.groupBuilder,
          primary_column: suggestedPrimary,
        },
      }));
      return;
    }

    if (!draft.mappings.treatment_level_1 && availableColumns.has("group") && groupBuilder.primary_column) {
      updateDraft((current) => ({
        ...current,
        mappings: {
          ...current.mappings,
          treatment_level_1: "group",
        },
      }));
    }

    if (nextBatch && !draft.groupBuilder.batch_column && metadataColumns.includes(nextBatch)) {
      updateDraft((current) => ({
        ...current,
        groupBuilder: {
          ...current.groupBuilder,
          batch_column: nextBatch,
        },
      }));
      return;
    }

    if (nextBatch && !draft.mappings.batch && availableColumns.has(nextBatch)) {
      updateDraft((current) => ({
        ...current,
        mappings: {
          ...current.mappings,
          batch: nextBatch,
        },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadataColumns.join("|"), derivedMetadataColumns.join("|"), templateContext.batch_vars.join("|"), groupBuilder.primary_column, groupBuilder.batch_column]);

  useEffect(() => {
    const validKeys = new Set(suggestedContrasts.map((item) => `${item.reference_group}::${item.comparison_group}`));
    const nextSelected = draft.mappings.selected_contrasts.filter((item) =>
      validKeys.has(`${item.reference_group}::${item.comparison_group}`),
    );
    if (nextSelected.length === draft.mappings.selected_contrasts.length) {
      return;
    }
    updateDraft((current) => ({
      ...current,
      mappings: {
        ...current.mappings,
        selected_contrasts: nextSelected,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedContrasts.map((item) => `${item.reference_group}::${item.comparison_group}`).join("|")]);

  async function persistTemplateContext() {
    await saveOnboardingDraftMutation.mutateAsync({
      template_context: templateContext,
    });
  }

  async function persistCurrentStep(stepKey: OnboardingStepKey) {
    setOnboardingSaveError(null);
    if (stepKey === "details") {
      await saveStudyDetailsMutation.mutateAsync();
      await saveOnboardingDraftMutation.mutateAsync({ config: draft.config });
      markStepAttempted(stepKey);
      return;
    }
    if (stepKey === "design" || stepKey === "metadata") {
      await persistTemplateContext();
      markStepAttempted(stepKey);
      return;
    }
    if (stepKey === "upload") {
      markStepAttempted(stepKey);
      return;
    }
    if (stepKey === "finalize") {
      const { selected_contrasts, ...mappingsPayload } = draft.mappings;
      await saveOnboardingDraftMutation.mutateAsync({
        mappings: {
          ...mappingsPayload,
          treatment_level_1: groupBuilder.primary_column ? "group" : effectivePrimaryTreatmentMapping,
          batch: effectivePrimaryBatchMapping,
        },
        selected_contrasts,
        group_builder: groupBuilder,
        template_context: finalizeTemplateContext,
        config: draft.config,
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
    if (step.key === "design") {
      return {
        isSaved: templateStepSaved,
        isComplete: !designStepBlocked,
        isAttempted: Boolean(draft.attempts.design),
      };
    }
    if (step.key === "metadata") {
      return {
        isSaved: metadataStepSaved,
        isComplete: metadataStepComplete,
        isAttempted: Boolean(draft.attempts.metadata),
      };
    }
    if (step.key === "upload") {
      return {
        isSaved: uploadStepSaved,
        isComplete: uploadStepComplete,
        isAttempted: Boolean(draft.attempts.upload),
      };
    }
    if (step.key === "finalize") {
      return {
        isSaved: onboardingStatus === "final" || mappingsStepSaved,
        isComplete: onboardingStatus === "final" || mappingsStepComplete,
        isAttempted: Boolean(draft.attempts.finalize),
      };
    }
    return {
      isSaved: false,
      isComplete: false,
      isAttempted: false,
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

  const topLevelErrorMessage =
    deleteStudyError || onboardingFinalizeError || onboardingSaveError || templateDownloadError || generationError;
  const stepTransitionPending = saveStudyDetailsMutation.isPending || saveOnboardingDraftMutation.isPending;

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
                  list={`celltypeSuggestions-${studyId}`}
                  value={draft.template.celltype}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      template: { ...current.template, celltype: event.target.value },
                    }))
                  }
                />
                <datalist id={`celltypeSuggestions-${studyId}`}>
                  {celltypeSuggestions.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
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

              <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/20 p-4 md:col-span-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Sequencing setup</p>
                  <p className="text-xs text-muted-foreground">
                    Capture platform and run configuration here. These are study config values, not sample metadata columns.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label id="platformLabel">Platform</Label>
                    <div aria-labelledby="platformLabel" className="flex flex-wrap gap-2" role="group">
                      {platformOptions.map((value) => {
                        const selected = selectedPlatform === value;
                        return (
                          <Button
                            key={value}
                            type="button"
                            variant={selected ? "default" : "outline"}
                            onClick={() =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  common: {
                                    ...current.config.common,
                                    platform: value,
                                    biospyder_kit: value === "TempO-Seq" ? current.config.common.biospyder_kit : null,
                                  },
                                  pipeline: {
                                    ...current.config.pipeline,
                                    mode: value === "TempO-Seq" || value === "DrugSeq" ? "se" : current.config.pipeline.mode,
                                  },
                                },
                              }))
                            }
                          >
                            {value}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label id="sequencingModeLabel">Sequencing mode</Label>
                    <div aria-labelledby="sequencingModeLabel" className="flex flex-wrap gap-2" role="group">
                      {[
                        { label: "Single-end", value: "se" },
                        { label: "Paired-end", value: "pe" },
                      ].map((option) => {
                        const disabled =
                          option.value === "pe" && (selectedPlatform === "TempO-Seq" || selectedPlatform === "DrugSeq");
                        return (
                          <Button
                            key={option.value}
                            type="button"
                            variant={selectedMode === option.value ? "default" : "outline"}
                            disabled={disabled}
                            onClick={() =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  pipeline: {
                                    ...current.config.pipeline,
                                    mode: option.value,
                                  },
                                },
                              }))
                            }
                          >
                            {option.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="instrumentModel">Instrument model</Label>
                    <Input
                      id="instrumentModel"
                      list={`instrumentModelSuggestions-${studyId}`}
                      value={selectedInstrumentModel}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          config: {
                            ...current.config,
                            common: {
                              ...current.config.common,
                              instrument_model: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                    <datalist id={`instrumentModelSuggestions-${studyId}`}>
                      {[...featuredInstrumentModels, ...instrumentModelOptions.filter((value) => !featuredInstrumentModels.includes(value))].map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="sequencedBy">Sequenced by</Label>
                    <Input
                      id="sequencedBy"
                      list={`sequencedBySuggestions-${studyId}`}
                      value={selectedSequencedBy}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          config: {
                            ...current.config,
                            common: {
                              ...current.config.common,
                              sequenced_by: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                    <datalist id={`sequencedBySuggestions-${studyId}`}>
                      {sequencedBySuggestions.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>

                  {selectedPlatform === "TempO-Seq" ? (
                    <div className="grid gap-2">
                      <Label htmlFor="biospyderKit">Biospyder kit</Label>
                      <Select
                        value={selectedBiospyderKit ? String(selectedBiospyderKit) : "__none__"}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            config: {
                              ...current.config,
                              common: {
                                ...current.config.common,
                                biospyder_kit: value === "__none__" ? null : value,
                              },
                            },
                          }))
                        }
                      >
                        <SelectTrigger id="biospyderKit" aria-label="Biospyder kit">
                          <SelectValue placeholder="Select a Biospyder kit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select a Biospyder kit</SelectItem>
                          {biospyderKitOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {activeStep === "design" ? (
            <div className="space-y-5">
              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">Study design elements</p>
                    <Badge variant="outline">Required</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select what must be represented in the metadata template so the generated columns reflect the study design.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {STUDY_DESIGN_OPTIONS.map((option) => {
                    const selected = templateContext.study_design_elements.includes(option.key);
                    return (
                      <div
                        key={option.key}
                        className={cn(
                          "rounded-xl border bg-background/70 transition-colors",
                          selected ? "border-foreground bg-background shadow-sm" : "border-border hover:border-foreground/40",
                        )}
                      >
                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left"
                          onClick={() =>
                            updateDraft((current) => {
                              const nextStudyDesignElements = toggleValue(
                                current.template.context.study_design_elements,
                                option.key,
                              );
                              const exposureSelected = nextStudyDesignElements.includes("exposure");
                              return {
                                ...current,
                                template: {
                                  ...current.template,
                                  context: normalizeTemplateContext({
                                    ...current.template.context,
                                    study_design_elements: nextStudyDesignElements,
                                    exposure_label_mode: exposureSelected
                                      ? current.template.context.exposure_label_mode ?? "dose"
                                      : null,
                                    exposure_custom_label: exposureSelected
                                      ? current.template.context.exposure_custom_label
                                      : "",
                                  }),
                                },
                              };
                            })
                          }
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background text-transparent",
                              )}
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

                        {option.key === "exposure" && selected ? (
                          <div className="border-t border-border/70 px-4 py-4">
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-col gap-1">
                                <Label htmlFor="exposure-label-mode" className="text-sm font-medium text-foreground">
                                  Label exposure as
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  Pick the term the template should use. Mixed studies can include both dose and concentration.
                                </p>
                              </div>

                              <ToggleGroup
                                id="exposure-label-mode"
                                type="single"
                                variant="outline"
                                className="flex flex-wrap justify-start gap-2"
                                value={templateContext.exposure_label_mode ?? "dose"}
                                onValueChange={(value) => {
                                  if (!value) {
                                    return;
                                  }
                                  updateDraft((current) => ({
                                    ...current,
                                    template: {
                                      ...current.template,
                                      context: normalizeTemplateContext({
                                        ...current.template.context,
                                        exposure_label_mode: value as NonNullable<ExposureLabelMode>,
                                        exposure_custom_label:
                                          value === "custom" ? current.template.context.exposure_custom_label : "",
                                      }),
                                    },
                                  }));
                                }}
                              >
                                {EXPOSURE_LABEL_OPTIONS.map((choice) => (
                                  <ToggleGroupItem key={choice.value} value={choice.value} className="rounded-full">
                                    {choice.label}
                                  </ToggleGroupItem>
                                ))}
                              </ToggleGroup>

                              {templateContext.exposure_label_mode === "custom" ? (
                                <div className="grid gap-2">
                                  <Label htmlFor="exposure-custom-label">Custom exposure label</Label>
                                  <Input
                                    id="exposure-custom-label"
                                    aria-invalid={templateContext.exposure_custom_label.length === 0}
                                    value={templateContext.exposure_custom_label}
                                    placeholder="e.g. Nominal concentration"
                                    onChange={(event) =>
                                      updateDraft((current) => ({
                                        ...current,
                                        template: {
                                          ...current.template,
                                          context: normalizeTemplateContext({
                                            ...current.template.context,
                                            exposure_custom_label: event.target.value,
                                          }),
                                        },
                                      }))
                                    }
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Saved as <span className="font-mono">{templateContext.exposure_custom_label || "custom_exposure_label"}</span> in the template.
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {(templateContext.study_design_elements.includes("treatment") ||
                templateContext.study_design_elements.includes("batch")) ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {templateContext.study_design_elements.includes("treatment") ? (
                    <ChipSelectOrAdd
                      inputId="treatment-vars"
                      label="Treatment vars"
                      description="Name the treatment dimension(s) that must appear in the metadata template. The first value will prefill the primary treatment mapping later."
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
                      description="Add one or more batch variables when batch effects need to be tracked in the metadata template. The first value will prefill the primary batch mapping later."
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
                </div>
              ) : null}

              {designStepBlocked ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                  <p className="text-sm font-medium text-destructive">
                    Select at least one study design element, then name any treatment or batch variables required by that design before continuing.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeStep === "metadata" ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:grid-rows-[auto_auto]">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">Template preview</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review the generated metadata columns, then download the finalized template.
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
                          markStepAttempted("metadata");
                          const { blob, filename } = await downloadMetadataTemplate({
                            study_id: studyId,
                            optional_field_keys: templateContext.optional_field_keys,
                            custom_field_keys: templateContext.custom_field_keys,
                            template_context: templateContext,
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
                    {templatePreviewQuery.isLoading && !templatePreviewQuery.data ? (
                      <p className="text-muted-foreground">Building template preview…</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {templatePreviewQuery.isError ? (
                          <p className="text-destructive">
                            {templatePreviewErrorMessage} Showing your current field selections below.
                          </p>
                        ) : null}
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

                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Optional metadata columns</p>
                  <p className="text-xs text-muted-foreground">
                    Keep the template compact by selecting only the extra fields this study needs. Required and auto-included columns stay locked.
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
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sequencing identifiers</p>
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
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Common fields</p>
                        <div className="grid gap-2 md:grid-cols-2">
                          {commonFields.map((field) => (
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
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Additional fields</p>
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
                  updateDraft((current) => ({
                    ...current,
                    upload: {
                      ...current.upload,
                      metadataColumns: [],
                      validatedRows: [],
                      suggestedContrasts: [],
                    },
                  }));
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
                      validatedRows: result.validated_rows ?? [],
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

                queryClient.setQueryData(["study-onboarding-state", studyId], (current: typeof onboardingStateQuery.data) =>
                  current
                    ? {
                        ...current,
                        metadata_columns: result.columns ?? [],
                        validated_rows: result.validated_rows ?? [],
                        suggested_contrasts: result.suggested_contrasts ?? [],
                      }
                    : current,
                );
                queryClient.invalidateQueries({ queryKey: ["study-onboarding-state", studyId] });
              }}
            />
          ) : null}

          {activeStep === "finalize" ? (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Analysis setup</p>
                    <p className="text-xs text-muted-foreground">
                      Define how uploaded metadata should be combined into the final analysis `group` column.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="primary-grouping">Primary grouping variable</Label>
                      <Select
                        value={groupBuilder.primary_column || "__none__"}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            groupBuilder: normalizeGroupBuilder({
                              ...current.groupBuilder,
                              primary_column: value === "__none__" ? "" : value,
                            }),
                          }))
                        }
                      >
                        <SelectTrigger id="primary-grouping" aria-label="Primary grouping variable">
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

                    <div className="grid gap-2">
                      <Label htmlFor="batch-column">Batch column</Label>
                      <Select
                        value={groupBuilder.batch_column || "__none__"}
                        onValueChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            groupBuilder: normalizeGroupBuilder({
                              ...current.groupBuilder,
                              batch_column: value === "__none__" ? "" : value,
                            }),
                          }))
                        }
                      >
                        <SelectTrigger id="batch-column" aria-label="Batch column">
                          <SelectValue placeholder="Optional batch column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Optional batch column</SelectItem>
                          {metadataColumns.map((column) => (
                            <SelectItem key={column} value={column}>
                              {column}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Additional grouping columns</Label>
                    <MultiSelect
                      aria-label="Additional grouping columns"
                      options={metadataColumns
                        .filter((column) => column !== groupBuilder.primary_column)
                        .map((column) => ({ label: column, value: column }))}
                      selected={groupBuilder.additional_columns}
                      onChange={(selected) =>
                        updateDraft((current) => ({
                          ...current,
                          groupBuilder: normalizeGroupBuilder({
                            ...current.groupBuilder,
                            additional_columns: selected,
                          }),
                        }))
                      }
                      placeholder={
                        groupBuilder.primary_column
                          ? "Select additional columns to refine grouping"
                          : "Choose a primary grouping variable first"
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {groupBuilder.primary_column
                        ? `Computed group = ${[groupBuilder.primary_column, ...groupBuilder.additional_columns].join(" + ")}`
                        : "Choose a primary grouping variable to start building derived analysis groups."}
                    </p>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border/70 bg-background/80 p-3">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">Preview of computed group labels</p>
                      <p className="text-xs text-muted-foreground">
                        Previewing the uploaded metadata with the derived `group` values that will feed the workflow.
                      </p>
                    </div>
                    {validatedRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Upload and validate metadata to preview computed groups.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-border/70">
                        <table className="min-w-full text-left text-xs">
                          <thead className="bg-muted/40 text-foreground">
                            <tr>
                              {previewGroupColumns.map((column) => (
                                <th key={column} className="px-3 py-2 font-medium">
                                  {column}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {derivedGroupRows.slice(0, 6).map((row, index) => (
                              <tr key={`${String(row.sample_ID ?? index)}`} className="border-t border-border/60">
                                {previewGroupColumns.map((column) => (
                                  <td key={`${index}-${column}`} className="px-3 py-2 text-muted-foreground">
                                    {String(row[column] ?? "—")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 rounded-lg border border-border/70 bg-background/80 p-3">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">Experimental groups discovered</p>
                      <p className="text-xs text-muted-foreground">Unique derived group labels available for contrast selection.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set(derivedGroupRows.map((row) => String(row.group ?? "").trim()).filter(Boolean))).length === 0 ? (
                        <span className="text-sm text-muted-foreground">No derived groups available yet.</span>
                      ) : (
                        Array.from(new Set(derivedGroupRows.map((row) => String(row.group ?? "").trim()).filter(Boolean))).map((group) => (
                          <Badge key={group} variant="outline" className="rounded-full px-3 py-1">
                            {group}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border/70 bg-background/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">Suggested contrasts</p>
                        <p className="text-xs text-muted-foreground">
                          Derived from computed groups and `solvent_control`.
                        </p>
                      </div>
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
                    </div>

                    {suggestedContrasts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No contrast suggestions available yet.</p>
                    ) : (
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
                                    return {
                                      ...current,
                                      mappings: {
                                        ...current.mappings,
                                        selected_contrasts: nextChecked === true
                                          ? (alreadySelected ? currentPairs : [...currentPairs, pair])
                                          : currentPairs.filter(
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
                                {pair.comparison_group} vs {pair.reference_group}
                              </Label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
                  <div
                    className={cn(
                      "rounded-lg border p-3",
                      reviewWarnings.length === 0
                        ? "border-emerald-200 bg-emerald-50/80"
                        : "border-amber-200 bg-amber-50/80",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex size-8 items-center justify-center rounded-full",
                          reviewWarnings.length === 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                        )}
                      >
                        {reviewWarnings.length === 0 ? <Check aria-hidden="true" className="size-4" /> : <AlertCircle aria-hidden="true" className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {reviewWarnings.length === 0 ? "Ready for finalize" : "Validation needs attention"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {reviewWarnings.length === 0
                            ? "Computed groups are valid and ready for contrast selection."
                            : `${reviewWarnings.length} issue${reviewWarnings.length === 1 ? "" : "s"} should be reviewed before finalizing.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {reviewWarnings.length > 0 ? (
                    <div className="rounded-lg border border-border/70 bg-background/70 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-foreground">Blocking issues</p>
                      <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                        {reviewWarnings.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="space-y-3 rounded-lg border border-border/70 bg-background/80 p-3 text-muted-foreground">
                    <p className="font-medium text-foreground">Study summary</p>
                    {[
                      ["Title", draft.details.title || "—"],
                      ["Platform", selectedPlatform || "—"],
                      ["Sequencing mode", selectedMode || "—"],
                      ["Instrument model", selectedInstrumentModel || "—"],
                      ["Sequenced by", selectedSequencedBy || "—"],
                      ["Biospyder kit", selectedBiospyderKit ? String(selectedBiospyderKit) : "—"],
                      [
                        "Study design",
                        templateContext.study_design_elements.map((item) => getStudyDesignElementLabel(item, templateContext)).join(", ") || "—",
                      ],
                      ["Upload", draft.upload.fileName || "—"],
                      ["Onboarding status", onboardingStatus],
                    ].map(([label, value]) => (
                      <div key={label} className="grid gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-foreground">{label}</span>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3 rounded-lg border border-border/70 bg-background/80 p-3 text-muted-foreground">
                    <div className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-foreground">Detected metadata columns</span>
                      <span>{metadataColumns.join(", ") || "—"}</span>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-foreground">Primary analysis column</span>
                      <span>{effectivePrimaryTreatmentMapping || "—"}</span>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-foreground">Additional grouping columns</span>
                      <span>{additionalTreatmentMappings.join(", ") || "—"}</span>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-foreground">Batch column</span>
                      <span>{effectivePrimaryBatchMapping || "—"}</span>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border/70 bg-background/80 p-3">
                    <p className="font-medium text-foreground">Output readiness</p>
                    <p className="text-xs text-muted-foreground">
                      The generated bundle will include `metadata.tsv`, `contrasts.tsv`, and `config.yaml`.
                    </p>
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
                              mappings: {
                                ...mappingsPayload,
                                treatment_level_1: groupBuilder.primary_column ? "group" : effectivePrimaryTreatmentMapping,
                                batch: effectivePrimaryBatchMapping,
                              },
                              selected_contrasts,
                              group_builder: groupBuilder,
                              template_context: finalizeTemplateContext,
                              config: draft.config,
                            },
                            {
                              onSuccess: () => {
                                markStepAttempted("finalize");
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
                              mappings: {
                                ...mappingsPayload,
                                treatment_level_1: groupBuilder.primary_column ? "group" : effectivePrimaryTreatmentMapping,
                                batch: effectivePrimaryBatchMapping,
                              },
                              selected_contrasts,
                              group_builder: groupBuilder,
                              template_context: finalizeTemplateContext,
                              config: draft.config,
                            });
                            markStepAttempted("finalize");
                            await finalizeOnboardingMutation.mutateAsync();
                          } catch {
                            // mutation handlers surface errors
                          }
                        }}
                      >
                        {finalizeOnboardingMutation.isPending ? "Finalizing…" : "Finalize onboarding"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={onboardingStatus !== "final" || generateOutputsMutation.isPending}
                        onClick={() => {
                          setGenerationError(null);
                          generateOutputsMutation.mutate();
                        }}
                      >
                        {generateOutputsMutation.isPending ? "Generating…" : "Generate outputs"}
                      </Button>
                    </div>
                    {saveStudyDetailsMutation.isPending || saveOnboardingDraftMutation.isPending ? (
                      <p className="text-sm text-muted-foreground">Saving changes before moving on…</p>
                    ) : null}
                    {onboardingStatus !== "final" ? (
                      <p className="text-sm text-muted-foreground">
                        Finalize onboarding to unlock output generation for this study.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="flex flex-col gap-3 border-t bg-muted/10 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <StudyDeleteDialog
              studyId={studyId}
              studyTitle={draft.details.title.trim() || studyQuery.data?.title || "Untitled study"}
              isDeleting={deleteStudyMutation.isPending}
              onConfirmDelete={(nextStudyId) => {
                setDeleteStudyError(null);
                deleteStudyMutation.mutate(nextStudyId);
              }}
            >
              <Button type="button" variant="destructive">
                Delete study
              </Button>
            </StudyDeleteDialog>
            {prevStep ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => goToStep(prevStep)}
              >
                Back
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            disabled={
              !nextStep ||
              (activeStep === "design" && designStepBlocked) ||
              (activeStep === "upload" && !uploadStepComplete) ||
              stepTransitionPending
            }
            onClick={() => {
              void handleContinue();
            }}
          >
            {stepTransitionPending ? "Saving…" : "Continue"}
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
