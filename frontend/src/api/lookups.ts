import { apiFetch, parseErrorMessage } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export type MetadataFieldDefinition = {
  key: string;
  label: string;
  group: string;
  description: string;
  data_type: "string" | "integer" | "float" | "boolean";
  kind: "standard" | "custom";
  required: boolean;
  auto_include_keys: string[];
};

export type LookupBucket = {
  policy: "admin_managed" | "scoped_select_or_create";
  values: string[];
};

export type LookupsResponseV1 = {
  version: 1;
  metadata_field_definitions: MetadataFieldDefinition[];
  lookups: {
    soft: {
      pi_name: LookupBucket;
      researcher_name: LookupBucket;
    };
    controlled: Record<string, LookupBucket>;
  };
};

export async function fetchLookups(): Promise<LookupsResponseV1> {
  const response = await apiFetch(`${apiBaseUrl}/api/lookups/`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load lookups."));
  }

  return response.json();
}

