import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Papa from "papaparse";
import { vi } from "vitest";

import { validateMetadataUpload } from "../../api/metadataValidation";
import { MetadataUploadStep } from "./MetadataUploadStep";

vi.mock("papaparse", () => ({
  default: {
    parse: vi.fn(),
  },
}));

vi.mock("../../api/metadataValidation", async () => {
  const actual = await vi.importActual<typeof import("../../api/metadataValidation")>("../../api/metadataValidation");
  return {
    ...actual,
    validateMetadataUpload: vi.fn(async () => ({
      valid: true,
      issues: [],
      columns: ["sample_ID", "group"],
      validated_rows: [{ sample_ID: "sample-1", group: "control" }],
      suggested_contrasts: [],
    })),
  };
});

function renderUploadStep(onValidationResultChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MetadataUploadStep
        studyId={11}
        expectedColumns={["sample_ID", "group"]}
        fileName=""
        onFileNameChange={vi.fn()}
        onValidationResultChange={onValidationResultChange}
      />
    </QueryClientProvider>,
  );

  return { onValidationResultChange };
}

describe("MetadataUploadStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Papa.parse).mockImplementation(((_file: unknown, config?: Papa.ParseConfig<unknown>) => {
      const parseConfig = config as {
        complete?: (results: Papa.ParseResult<unknown>, file?: File) => void;
      } | undefined;

      parseConfig?.complete?.({
        data: [{ sample_ID: "sample-1", group: "control" }],
        errors: [],
        meta: {
          aborted: false,
          cursor: 0,
          delimiter: ",",
          fields: ["sample_ID", "group"],
          linebreak: "\n",
          renamedHeaders: undefined,
          truncated: false,
        },
      }, _file as File);
      return {} as Papa.Parser;
    }) as unknown as typeof Papa.parse);
  });

  it("clears stale validation and reparses when the same filename is chosen again", async () => {
    const onValidationResultChange = vi.fn();
    renderUploadStep(onValidationResultChange);

    const input = screen.getByTestId("metadata-file-input") as HTMLInputElement;
    const correctedFile = new File(["sample_ID,group\nsample-1,control\n"], "metadata.csv", { type: "text/csv" });

    fireEvent.change(input, { target: { files: [correctedFile] } });
    await waitFor(() => expect(validateMetadataUpload).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { files: [correctedFile] } });
    await waitFor(() => expect(validateMetadataUpload).toHaveBeenCalledTimes(2));

    expect(onValidationResultChange).toHaveBeenCalledWith(null);
    expect(input.value).toBe("");
  });
});
