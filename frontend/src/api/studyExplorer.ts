import type { ContrastPair } from "./studyOnboarding";
import { apiFetch, parseErrorMessage } from "./http";

export type SummaryBucket = {
  value: string;
  count: number;
};

export type StudyExplorerIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  action_label: string;
  filter: Record<string, string>;
};

export type StudyExplorerSummary = {
  study_id: number;
  readiness: {
    status: "ready" | "warning" | "error";
    label: string;
    updated_at: string | null;
    finalized_at: string | null;
  };
  sample_summary: {
    total: number;
    technical_controls: number;
    reference_rna_controls: number;
    solvent_controls: number;
  };
  assay_summary: {
    total: number;
    samples_with_assays: number;
    samples_missing_assays: number;
    platforms: SummaryBucket[];
  };
  design_summary: {
    groups: SummaryBucket[];
    doses: SummaryBucket[];
    chemicals: SummaryBucket[];
    metadata_columns: string[];
    treatment_vars: string[];
    batch_vars: string[];
  };
  contrast_summary: {
    selected_count: number;
    suggested_count: number;
    selected: ContrastPair[];
    suggested: ContrastPair[];
  };
  config_summary: {
    platform: string;
    sequencing_mode: string;
    instrument_model: string;
    sequenced_by: string;
    biospyder_kit: string | null;
    can_download_config: boolean;
  };
  geo_summary: {
    can_download_csv: boolean;
    populated_field_count: number;
    total_field_count: number;
    manual_field_labels: string[];
  };
  blocking_issues: StudyExplorerIssue[];
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchStudyExplorerSummary(studyId: number): Promise<StudyExplorerSummary> {
  const response = await apiFetch(`${apiBaseUrl}/api/studies/${studyId}/explorer-summary/`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load study explorer summary."));
  }

  return response.json();
}
