import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";

import { StudyOnboardingWizard } from "./StudyOnboardingWizard";
import { validateMetadataUpload } from "../../api/metadataValidation";
import {
  fetchStudyOnboardingState,
  patchStudyOnboardingState,
  finalizeStudyOnboardingState,
} from "../../api/studyOnboarding";
import { updateStudy } from "../../api/studies";

vi.mock("papaparse", () => ({
  default: {
    parse: (_file: File, config: { complete: (results: unknown) => void }) => {
      config.complete({
        data: [
          { sample_ID: "", sample_name: "A", group: "control", plate: "plate-1", solvent_control: "T" },
          { sample_ID: "sample-2", sample_name: "B", group: "treated", plate: "plate-1", solvent_control: "F" },
        ],
        meta: { fields: ["sample_ID", "sample_name", "group", "plate", "solvent_control"] },
      });
    },
  },
}));

vi.mock("../../api/metadataValidation", async () => {
  const actual = await vi.importActual<typeof import("../../api/metadataValidation")>("../../api/metadataValidation");
  return {
    ...actual,
    validateMetadataUpload: vi.fn(async () => ({
      valid: false,
      issues: [
        { row_index: 0, column_key: "sample_ID", message: "sample_ID is required.", severity: "error" },
      ],
      columns: ["group", "plate", "sample_ID", "sample_name", "solvent_control"],
      suggested_contrasts: [{ reference_group: "control", comparison_group: "treated" }],
    })),
  };
});

vi.mock("../../api/studyOnboarding", async () => {
  const actual = await vi.importActual<typeof import("../../api/studyOnboarding")>("../../api/studyOnboarding");
  return {
    ...actual,
    fetchStudyOnboardingState: vi.fn(async () => ({
      status: "draft",
      metadata_columns: ["group", "plate", "sample_ID", "sample_name", "solvent_control"],
      mappings: {
        treatment_level_1: "",
        treatment_level_2: "",
        treatment_level_3: "",
        treatment_level_4: "",
        treatment_level_5: "",
        batch: "",
        pca_color: "",
        pca_shape: "",
        pca_alpha: "",
        clustering_group: "",
        report_faceting_group: "",
      },
      suggested_contrasts: [{ reference_group: "control", comparison_group: "treated" }],
      selected_contrasts: [],
      updated_at: "2026-04-08T00:00:00.000Z",
      finalized_at: null,
    })),
    patchStudyOnboardingState: vi.fn(async (studyId: number, payload: unknown) => {
      const base = (await (fetchStudyOnboardingState as unknown as (studyId: number) => Promise<any>)(studyId));
      return {
        ...base,
        ...(payload as any),
      };
    }),
    finalizeStudyOnboardingState: vi.fn(async () => ({
      status: "final",
      metadata_columns: ["group", "plate", "sample_ID", "sample_name", "solvent_control"],
      mappings: {
        treatment_level_1: "group",
        treatment_level_2: "",
        treatment_level_3: "",
        treatment_level_4: "",
        treatment_level_5: "",
        batch: "plate",
        pca_color: "",
        pca_shape: "",
        pca_alpha: "",
        clustering_group: "",
        report_faceting_group: "",
      },
      suggested_contrasts: [{ reference_group: "control", comparison_group: "treated" }],
      selected_contrasts: [{ reference_group: "control", comparison_group: "treated" }],
      updated_at: "2026-04-08T00:00:00.000Z",
      finalized_at: "2026-04-08T00:00:00.000Z",
    })),
  };
});

vi.mock("../../api/lookups", async () => {
  const actual = await vi.importActual<typeof import("../../api/lookups")>("../../api/lookups");
  return {
    ...actual,
    fetchLookups: vi.fn(async () => ({
      version: 1,
      metadata_field_definitions: [
        {
          key: "sample_ID",
          label: "Sample ID",
          group: "Core",
          description: "",
          data_type: "string",
          kind: "standard",
          required: true,
          auto_include_keys: [],
        },
        {
          key: "sample_name",
          label: "Sample name",
          group: "Core",
          description: "",
          data_type: "string",
          kind: "standard",
          required: true,
          auto_include_keys: [],
        },
        {
          key: "group",
          label: "Group",
          group: "Core",
          description: "",
          data_type: "string",
          kind: "standard",
          required: true,
          auto_include_keys: [],
        },
        {
          key: "chemical",
          label: "Chemical",
          group: "Toxicology",
          description: "Selecting this auto-adds CASN.",
          data_type: "string",
          kind: "standard",
          required: false,
          auto_include_keys: ["CASN"],
        },
        {
          key: "CASN",
          label: "CAS Number",
          group: "Toxicology",
          description: "",
          data_type: "string",
          kind: "standard",
          required: false,
          auto_include_keys: [],
        },
        {
          key: "dose",
          label: "Dose",
          group: "Toxicology",
          description: "",
          data_type: "float",
          kind: "standard",
          required: false,
          auto_include_keys: [],
        },
        {
          key: "timepoint",
          label: "Timepoint",
          group: "Study design",
          description: "",
          data_type: "string",
          kind: "custom",
          required: false,
          auto_include_keys: [],
        },
      ],
      lookups: {
        soft: {
          pi_name: { policy: "scoped_select_or_create", values: ["Dr. Example"] },
          researcher_name: { policy: "scoped_select_or_create", values: ["Researcher Example"] },
        },
        controlled: {
          genome_version: { policy: "admin_managed", values: [] },
        },
      },
    })),
  };
});

vi.mock("../../api/studies", async () => {
  const actual = await vi.importActual<typeof import("../../api/studies")>("../../api/studies");
  return {
    ...actual,
    fetchStudy: vi.fn(async () => ({
      id: 11,
      project: 7,
      project_title: "Mercury tox study",
      title: "Hepatocyte mercury dose response",
      description: "",
      status: "draft",
      species: null,
      celltype: null,
      treatment_var: null,
      batch_var: null,
    })),
    updateStudy: vi.fn(async (_studyId: number, payload: Record<string, unknown>) => ({
      id: 11,
      project: 7,
      project_title: "Mercury tox study",
      title: String(payload.title ?? "Hepatocyte mercury dose response"),
      description: String(payload.description ?? ""),
      status: "draft",
      species: payload.species ?? "human",
      celltype: payload.celltype ?? "hepatocyte",
      treatment_var: payload.treatment_var ?? "group",
      batch_var: payload.batch_var ?? "plate",
    })),
  };
});

vi.mock("../../api/metadataTemplates", async () => {
  const actual = await vi.importActual<typeof import("../../api/metadataTemplates")>("../../api/metadataTemplates");
  return {
    ...actual,
    previewMetadataTemplate: vi.fn(async (payload: { optional_field_keys: string[]; custom_field_keys: string[] }) => {
      const required = ["sample_ID", "sample_name", "group"];
      const optional = payload.optional_field_keys ?? [];
      const custom = payload.custom_field_keys ?? [];
      const columns = [...required];
      for (const key of [...optional, ...custom]) {
        if (!columns.includes(key)) {
          columns.push(key);
        }
        if (key === "chemical" && !columns.includes("CASN")) {
          columns.push("CASN");
        }
      }
      return {
        columns,
        auto_included: optional.includes("chemical") ? [{ key: "CASN", reason: "chemical selected" }] : [],
        deprecated_fields: [],
        project_code: "example-7",
        filename: "example-7_metadata.csv",
      };
    }),
    downloadMetadataTemplate: vi.fn(async () => ({
      blob: new Blob(["sample_ID,sample_name,group\n"], { type: "text/csv" }),
      filename: "example-7_metadata.csv",
    })),
  };
});

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderWizard(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/studies/:studyId/onboarding"
            element={
              <div>
                <LocationDisplay />
                <StudyOnboardingWizard />
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudyOnboardingWizard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to the details step when the step query param is missing", () => {
    renderWizard("/studies/11/onboarding");

    expect(screen.getByRole("heading", { name: "High-level details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Study title")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/studies/11/onboarding");
  });

  it("honors the step query param when present", () => {
    renderWizard("/studies/11/onboarding?step=upload");

    expect(screen.getByRole("heading", { name: "Upload + validation" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/studies/11/onboarding?step=upload");
  });

  it("persists draft state in localStorage scoped to the study", () => {
    const { unmount } = renderWizard("/studies/11/onboarding");

    fireEvent.change(screen.getByLabelText("PI name"), { target: { value: "Dr. Example" } });
    expect(screen.getByDisplayValue("Dr. Example")).toBeInTheDocument();

    unmount();

    renderWizard("/studies/11/onboarding");
    expect(screen.getByDisplayValue("Dr. Example")).toBeInTheDocument();
  });

  it("navigates to the next step and updates the URL", () => {
    renderWizard("/studies/11/onboarding");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Template selection" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/studies/11/onboarding?step=template");
  });

  it("auto-adds CASN in the template preview when chemical is selected", async () => {
    renderWizard("/studies/11/onboarding?step=template");

    expect(await screen.findByLabelText("Cell type")).toBeInTheDocument();
    expect(screen.getByLabelText("Treatment variable")).toBeInTheDocument();
    expect(screen.getByLabelText("Batch variable")).toBeInTheDocument();
    const chemicalCheckbox = await screen.findByLabelText("Chemical");
    fireEvent.click(chemicalCheckbox);

    expect(await screen.findByText("Auto-added CASN: chemical selected")).toBeInTheDocument();
  });

  it("parses an uploaded sheet, shows a preview, and renders aggregate validation issues", async () => {
    renderWizard("/studies/11/onboarding?step=upload");

    const input = screen.getByLabelText("Or choose a file") as HTMLInputElement;
    const file = new File(["sample_ID,sample_name,group\n,sample-a,control\n"], "metadata.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("sample_ID is required.")).toBeInTheDocument();
    expect(validateMetadataUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        study_id: 11,
        expected_columns: expect.arrayContaining(["sample_ID", "sample_name", "group"]),
      }),
    );
  });

  it("derives mapping column options from uploaded metadata (not just template preview)", async () => {
    renderWizard("/studies/11/onboarding?step=upload");

    const input = screen.getByLabelText("Or choose a file") as HTMLInputElement;
    const file = new File(["sample_ID,sample_name,group,plate,solvent_control\n"], "metadata.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("sample_ID is required.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: /contrasts \+ mappings/i })).toBeInTheDocument();
    expect(fetchStudyOnboardingState).toHaveBeenCalledWith(11);

    fireEvent.click(await screen.findByLabelText(/treatment level 1/i));
    expect(await screen.findByRole("option", { name: "plate" })).toBeInTheDocument();
  });

  it("allows saving a draft mapping before finalization and gates output generation until final", async () => {
    renderWizard("/studies/11/onboarding?step=mappings");

    expect(await screen.findByText(/status: draft/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /finalize mappings/i })).toBeInTheDocument();

    fireEvent.click(await screen.findByLabelText(/treatment level 1/i));
    fireEvent.click(await screen.findByRole("option", { name: "group" }));

    fireEvent.click(await screen.findByRole("button", { name: /save draft/i }));
    await waitFor(() =>
      expect(patchStudyOnboardingState).toHaveBeenCalledWith(
        11,
        expect.objectContaining({
          mappings: expect.objectContaining({ treatment_level_1: "group" }),
        }),
      ),
    );

    fireEvent.click(await screen.findByRole("button", { name: /finalize mappings/i }));
    await waitFor(() => expect(finalizeStudyOnboardingState).toHaveBeenCalledWith(11));
    expect(updateStudy).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        title: "Hepatocyte mercury dose response",
      }),
    );
  });
});
