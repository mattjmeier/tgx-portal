import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Papa from "papaparse";

import { BulkSampleImportError } from "../api/samples";
import { SampleUploadPanel } from "./SampleUploadPanel";

vi.mock("../api/samples", async () => {
  const actual = await vi.importActual<typeof import("../api/samples")>("../api/samples");
  return {
    ...actual,
    createSamplesBulk: vi.fn(),
  };
});

vi.mock("papaparse", () => ({
  default: {
    parse: vi.fn(),
  },
}));

describe("SampleUploadPanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("highlights the exact cells returned by upload validation", async () => {
    const { createSamplesBulk } = await import("../api/samples");
    vi.mocked(createSamplesBulk).mockRejectedValue(
      new BulkSampleImportError("One or more rows failed validation.", [
        {
          rowNumber: 2,
          message: "sample_ID: invalid | dose: invalid",
          fieldErrors: {
            sample_ID: ["sample_ID may only contain letters, numbers, hyphens, and underscores."],
            dose: ["Input should be greater than or equal to 0"],
          },
        },
      ]),
    );

    vi.mocked(Papa.parse).mockImplementation((_file, config) => {
      config.complete?.({
        data: [
          {
            sample_ID: "bad sample",
            sample_name: "Sample 1",
            description: "",
            group: "treated",
            chemical: "",
            chemical_longname: "",
            dose: "-1",
            technical_control: "false",
            reference_rna: "false",
            solvent_control: "false",
          },
        ],
        errors: [],
        meta: {
          aborted: false,
          cursor: 0,
          delimiter: ",",
          fields: [],
          linebreak: "\n",
          renamedHeaders: null,
          truncated: false,
        },
      });
    });

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <SampleUploadPanel studyId={1} />
      </QueryClientProvider>,
    );

    const fileInput = screen.getByLabelText(/choose a csv or tsv file to preview sample rows/i);
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["sample_ID"], "samples.csv", { type: "text/csv" })],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /import samples/i }));

    await waitFor(() => {
      expect(screen.getByText(/one or more rows failed validation/i)).toBeInTheDocument();
    });

    expect(screen.getByText("bad sample").closest("td")).toHaveClass("preview-cell-error");
    expect(screen.getByText("-1").closest("td")).toHaveClass("preview-cell-error");
    expect(screen.getByText("Sample 1").closest("td")).not.toHaveClass("preview-cell-error");
  });
});
