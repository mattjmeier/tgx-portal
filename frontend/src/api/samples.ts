import type { PaginatedResponse } from "./projects";
import { apiFetch, parseErrorMessage } from "./http";

export type Sample = {
  id: number;
  study: number;
  sample_ID: string;
  sample_name: string;
  description: string;
  group: string;
  chemical: string;
  chemical_longname: string;
  dose: number;
  technical_control: boolean;
  reference_rna: boolean;
  solvent_control: boolean;
};

export type CreateSamplePayload = Omit<Sample, "id">;
export type SampleQueryParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  ordering?: string;
};

export class BulkSampleImportError extends Error {
  rowErrors: Array<{ rowNumber: number; message: string }>;

  constructor(message: string, rowErrors: Array<{ rowNumber: number; message: string }> = []) {
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

        const messages = Object.entries(rowError as Record<string, unknown>).flatMap(([field, value]) => {
          if (!Array.isArray(value)) {
            return [];
          }

          return value.map((item) => {
            if (typeof item === "string") {
              return `${field}: ${item}`;
            }
            return `${field}: ${JSON.stringify(item)}`;
          });
        });

        return messages.length > 0
          ? [{ rowNumber: index + 2, message: messages.join(" | ") }]
          : [{ rowNumber: index + 2, message: "Invalid row." }];
      });

      throw new BulkSampleImportError("One or more rows failed validation.", rowErrors);
    }

    throw new BulkSampleImportError(await parseErrorMessage(response, "Failed to import samples."));
  }

  return response.json();
}
