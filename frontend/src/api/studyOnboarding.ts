import { apiFetch, parseErrorMessage } from "./http";

export type StudyOnboardingStatus = "draft" | "final";

export type ContrastPair = {
  reference_group: string;
  comparison_group: string;
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

export type StudyOnboardingState = {
  study_id: number;
  status: StudyOnboardingStatus;
  metadata_columns: string[];
  mappings: StudyOnboardingMappings;
  suggested_contrasts: ContrastPair[];
  selected_contrasts: ContrastPair[];
  updated_at: string | null;
  finalized_at: string | null;
};

export type PatchStudyOnboardingStatePayload = Partial<Pick<StudyOnboardingState, "mappings" | "selected_contrasts">>;

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

