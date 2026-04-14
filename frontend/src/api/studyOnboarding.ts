import { apiFetch, parseErrorMessage } from "./http";

export type StudyOnboardingStatus = "draft" | "final";

export type ContrastPair = {
  reference_group: string;
  comparison_group: string;
};

export type StudyOnboardingGroupBuilder = {
  primary_column: string;
  additional_columns: string[];
  batch_column: string;
};

export type StudyTemplateContext = {
  study_design_elements: string[];
  exposure_label_mode: "dose" | "concentration" | "both" | "custom" | null;
  exposure_custom_label: string;
  treatment_vars: string[];
  batch_vars: string[];
  optional_field_keys: string[];
  custom_field_keys: string[];
};

export type StudyOnboardingMappings = {
  treatment_level_1: string;
  treatment_level_2: string;
  treatment_level_3: string;
  treatment_level_4: string;
  treatment_level_5: string;
  batch: string;
  pca_color: string;
  pca_shape: string;
  pca_alpha: string;
  clustering_group: string;
  report_faceting_group: string;
};

export type StudyOnboardingConfig = {
  common: Record<string, unknown>;
  pipeline: Record<string, unknown>;
  qc: Record<string, unknown>;
  deseq2: Record<string, unknown>;
};

export type StudyOnboardingState = {
  study_id: number;
  status: StudyOnboardingStatus;
  metadata_columns: string[];
  validated_rows: Array<Record<string, unknown>>;
  mappings: StudyOnboardingMappings;
  group_builder: StudyOnboardingGroupBuilder;
  template_context: StudyTemplateContext;
  template_columns?: string[];
  config: StudyOnboardingConfig;
  suggested_contrasts: ContrastPair[];
  selected_contrasts: ContrastPair[];
  updated_at: string | null;
  finalized_at: string | null;
};

export type PatchStudyOnboardingStatePayload = Partial<
  Pick<StudyOnboardingState, "mappings" | "selected_contrasts" | "template_context" | "config" | "group_builder">
>;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchStudyOnboardingState(studyId: number): Promise<StudyOnboardingState> {
  const response = await apiFetch(`${apiBaseUrl}/api/studies/${studyId}/onboarding-state/`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load onboarding state."));
  }
  return response.json();
}

export async function patchStudyOnboardingState(
  studyId: number,
  payload: PatchStudyOnboardingStatePayload,
): Promise<StudyOnboardingState> {
  const response = await apiFetch(`${apiBaseUrl}/api/studies/${studyId}/onboarding-state/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to save onboarding draft."));
  }
  return response.json();
}

export async function finalizeStudyOnboardingState(studyId: number): Promise<StudyOnboardingState> {
  const response = await apiFetch(`${apiBaseUrl}/api/studies/${studyId}/onboarding-finalize/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to finalize onboarding mappings."));
  }
  return response.json();
}
