import { apiFetch, parseErrorMessage } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export type MetadataFieldDefinition = {
  key: string;
  label: string;
  group: string;
  description: string;
  scope: "sample" | "config";
  system_key: string;
  data_type: "string" | "integer" | "float" | "boolean";
  kind: "standard" | "custom";
  required: boolean;
  is_core: boolean;
  allow_null: boolean;
  choices: string[];
  regex: string;
  min_value: number | null;
  max_value: number | null;
  auto_include_keys: string[];
  wizard_featured: boolean;
  wizard_featured_order: number;
};

export type LookupOption = {
  label: string;
  value: string;
};

export type LookupValue = string | LookupOption;

export type LookupBucket = {
  policy: "admin_managed" | "scoped_select_or_create";
  values: LookupValue[];
};

export type LookupsResponseV2 = {
  version: 2;
  metadata_field_definitions: MetadataFieldDefinition[];
  lookups: {
    soft: {
      pi_name: LookupBucket;
      researcher_name: LookupBucket;
      celltype: LookupBucket;
      sequenced_by: LookupBucket;
    };
    controlled: Record<string, LookupBucket>;
    featured?: Record<string, string[]>;
  };
};

export async function fetchLookups(): Promise<LookupsResponseV2> {
  const response = await apiFetch(`${apiBaseUrl}/api/lookups/`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load lookups."));
  }

  return response.json();
}
