import { apiFetch, parseErrorMessage } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export type ReferenceChoice = {
  value: string;
  label: string;
};

export type TechnologyTypeSummary = ReferenceChoice & {
  platform_count: number;
};

export type ControlledLookupBucket = {
  label: string;
  values: Array<string | ReferenceChoice>;
};

export type ProfilingPlatformSummary = {
  id: number;
  platform_name: string;
  title: string;
  description: string;
  version: string;
  technology_type: string;
  study_type: string;
  species: string | null;
  species_label: string | null;
  url: string;
  ext: Record<string, unknown>;
  study_count: number;
};

export type DriftWarning = {
  category: string;
  value: string;
  message: string;
};

export type ReferenceLibraryResponse = {
  version: 1;
  summary: {
    species_count: number;
    assay_platform_count: number;
    profiling_platform_count: number;
    technology_type_count: number;
    controlled_lookup_count: number;
    drift_warning_count: number;
  };
  hierarchy: Array<{
    name: string;
    description: string;
    app_boundary: string;
  }>;
  species: ReferenceChoice[];
  assay_platforms: ReferenceChoice[];
  technology_types: TechnologyTypeSummary[];
  controlled_lookups: Record<string, ControlledLookupBucket>;
  profiling_platforms: ProfilingPlatformSummary[];
  drift_warnings: DriftWarning[];
};

export async function fetchReferenceLibrary(): Promise<ReferenceLibraryResponse> {
  const response = await apiFetch(`${apiBaseUrl}/api/reference-library/`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load reference library."));
  }

  return response.json();
}
