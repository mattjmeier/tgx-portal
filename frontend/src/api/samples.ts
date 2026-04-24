import type { PaginatedResponse } from "./projects";
import { apiFetch, parseErrorMessage } from "./http";

export type Sample = {
  id: number;
  study: number;
  sample_ID: string;
  sample_name: string;
  description: string;
  technical_control: boolean;
  reference_rna: boolean;
  solvent_control: boolean;
  metadata: Record<string, unknown>;
};

export type CreateSamplePayload = Omit<Sample, "id">;
export type SampleQueryParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  ordering?: string;
  group?: string;
  dose?: string;
  chemical?: string;
  controlFlag?: "technical_control" | "reference_rna" | "solvent_control" | "any";
  assayStatus?: "present" | "missing";
  missingMetadata?: string;
};

export type BulkSampleRowError = {
  rowNumber: number;
  message: string;
  fieldErrors: Record<string, string[]>;
};

export class BulkSampleImportError extends Error {
  rowErrors: BulkSampleRowError[];

  constructor(message: string, rowErrors: BulkSampleRowError[] = []) {
    super(message);
    this.name = "BulkSampleImportError";
    this.rowErrors = rowErrors;
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchSamples(
  studyId: number,
  params: SampleQueryParams = {},
): Promise<PaginatedResponse<Sample>> {
  const searchParams = new URLSearchParams({
    study_id: String(studyId),
  });
  if (params.page) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize) {
    searchParams.set("page_size", String(params.pageSize));
  }
  if (params.search) {
    searchParams.set("search", params.search);
  }
  if (params.ordering) {
    searchParams.set("ordering", params.ordering);
  }
  if (params.group) {
    searchParams.set("group", params.group);
  }
  if (params.dose) {
    searchParams.set("dose", params.dose);
  }
  if (params.chemical) {
    searchParams.set("chemical", params.chemical);
  }
  if (params.controlFlag) {
    searchParams.set("control_flag", params.controlFlag);
  }
  if (params.assayStatus) {
    searchParams.set("assay_status", params.assayStatus);
  }
  if (params.missingMetadata) {
    searchParams.set("missing_metadata", params.missingMetadata);
  }

  const response = await apiFetch(`${apiBaseUrl}/api/samples/?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to load samples.");
  }

  return response.json();
}

export async function createSample(payload: CreateSamplePayload): Promise<Sample> {
  const response = await apiFetch(`${apiBaseUrl}/api/samples/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to create the sample."));
  }

  return response.json();
}

export async function deleteSample(sampleId: number): Promise<void> {
  const response = await apiFetch(`${apiBaseUrl}/api/samples/${sampleId}/`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to delete the sample."));
  }
}

export async function createSamplesBulk(payload: CreateSamplePayload[]): Promise<Sample[]> {
  const response = await apiFetch(`${apiBaseUrl}/api/samples/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as unknown;
    if (Array.isArray(errorPayload)) {
      const rowErrors = errorPayload.flatMap((rowError, index) => {
        if (!rowError || typeof rowError !== "object") {
          return [];
        }

        const fieldErrors = Object.entries(rowError as Record<string, unknown>).reduce<Record<string, string[]>>((accumulator, [field, value]) => {
          if (!Array.isArray(value)) {
            return accumulator;
          }

          const messages = value.flatMap((item) => {
            if (typeof item === "string") {
              return [item];
            }
            return [JSON.stringify(item)];
          });

          if (messages.length > 0) {
            accumulator[field] = messages;
          }

          return accumulator;
        }, {});

        const messages = Object.entries(fieldErrors).flatMap(([field, value]) =>
          value.map((message) => `${field}: ${message}`),
        );

        if (messages.length === 0) {
          return [];
        }

        return [{ rowNumber: index + 2, message: messages.join(" | "), fieldErrors }];
      });

      throw new BulkSampleImportError("One or more rows failed validation.", rowErrors);
    }

    throw new BulkSampleImportError(await parseErrorMessage(response, "Failed to import samples."));
  }

  return response.json();
}
