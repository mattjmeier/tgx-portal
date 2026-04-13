import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";

import { StudyOnboardingWizard } from "./StudyOnboardingWizard";
import { validateMetadataUpload } from "../../api/metadataValidation";
import { downloadMetadataTemplate } from "../../api/metadataTemplates";
import {
  fetchStudyOnboardingState,
  patchStudyOnboardingState,
  finalizeStudyOnboardingState,
} from "../../api/studyOnboarding";
import { updateStudy } from "../../api/studies";

let mockStudy = {
  id: 11,
  project: 7,
  project_title: "Mercury tox study",
  title: "Hepatocyte mercury dose response",
  description: "",
  status: "draft",
  species: null as "human" | "mouse" | "rat" | "hamster" | null,
  celltype: null as string | null,
  treatment_var: null as string | null,
  batch_var: null as string | null,
};

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
      study_id: 11,
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
      template_context: {
        study_design_elements: [],
        treatment_vars: [],
        batch_vars: [],
        optional_field_keys: [],
        custom_field_keys: [],
      },
      suggested_contrasts: [{ reference_group: "control", comparison_group: "treated" }],
      selected_contrasts: [],
      updated_at: "2026-04-08T00:00:00.000Z",
      finalized_at: null,
    })),
    patchStudyOnboardingState: vi.fn(async (studyId: number, payload: Record<string, unknown>) => {
      const base = await (fetchStudyOnboardingState as unknown as (studyId: number) => Promise<Record<string, unknown>>)(studyId);
      return {
        ...base,
        ...payload,
      };
    }),
    finalizeStudyOnboardingState: vi.fn(async () => ({
      study_id: 11,
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
      template_context: {
        study_design_elements: ["chemical", "treatment", "batch"],
        treatment_vars: ["group"],
        batch_vars: ["plate"],
        optional_field_keys: [],
        custom_field_keys: [],
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
          key: "concentration",
          label: "Concentration",
          group: "Toxicology",
          description: "",
          data_type: "float",
          kind: "standard",
          required: false,
          auto_include_keys: [],
        },
        {
          key: "i5_index",
          label: "i5 index",
          group: "Sequencing",
          description: "i5 sample index.",
          data_type: "string",
          kind: "standard",
          required: false,
          auto_include_keys: [],
        },
        {
          key: "i7_index",
          label: "i7 index",
          group: "Sequencing",
          description: "i7 sample index.",
          data_type: "string",
          kind: "standard",
          required: false,
          auto_include_keys: [],
        },
        {
          key: "well_id",
          label: "Well ID",
          group: "Sequencing",
          description: "Plate well identifier.",
          data_type: "string",
          kind: "standard",
          required: false,
          auto_include_keys: [],
        },
        {
          key: "sequencing_mode",
          label: "Sequencing mode",
          group: "Sequencing",
          description: "Single-end or paired-end sequencing mode.",
          data_type: "string",
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
    fetchStudy: vi.fn(async () => mockStudy),
    updateStudy: vi.fn(async (_studyId: number, payload: Record<string, unknown>) => {
      mockStudy = {
        ...mockStudy,
        title: String(payload.title ?? mockStudy.title),
        description: String(payload.description ?? mockStudy.description),
        species: (payload.species as typeof mockStudy.species | undefined) ?? mockStudy.species,
        celltype: (payload.celltype as string | null | undefined) ?? mockStudy.celltype,
      };
      return mockStudy;
    }),
  };
});

vi.mock("../../api/metadataTemplates", async () => {
  const actual = await vi.importActual<typeof import("../../api/metadataTemplates")>("../../api/metadataTemplates");
  return {
    ...actual,
    previewMetadataTemplate: vi.fn(async (payload: {
      optional_field_keys: string[];
      custom_field_keys: string[];
      template_context?: { study_design_elements?: string[] };
    }) => {
      const required = ["sample_ID", "sample_name", "group"];
      const columns = [...required];
      const autoIncluded: Array<{ key: string; reason: string }> = [];
      const studyDesignElements = payload.template_context?.study_design_elements ?? [];

      if (studyDesignElements.includes("chemical") && !columns.includes("chemical")) {
        columns.push("chemical");
        autoIncluded.push({ key: "chemical", reason: "chemical study design selected" });
      }

      if (studyDesignElements.includes("timepoint") && !columns.includes("timepoint")) {
        columns.push("timepoint");
        autoIncluded.push({ key: "timepoint", reason: "timepoint study design selected" });
      }

      for (const key of payload.optional_field_keys ?? []) {
        if (!columns.includes(key)) {
          columns.push(key);
        }
        if (key === "chemical" && !columns.includes("CASN")) {
          columns.push("CASN");
          autoIncluded.push({ key: "CASN", reason: "chemical selected" });
        }
      }

      for (const key of payload.custom_field_keys ?? []) {
        if (!columns.includes(key)) {
          columns.push(key);
        }
      }

      return {
        columns,
        auto_included: autoIncluded,
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
            element={(
              <div>
                <LocationDisplay />
                <StudyOnboardingWizard />
              </div>
            )}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudyOnboardingWizard", () => {
  beforeEach(() => {
    localStorage.clear();
    mockStudy = {
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
    };
  });

  it("defaults to the details step when the step query param is missing", async () => {
    renderWizard("/studies/11/onboarding");

    expect(await screen.findByRole("heading", { name: "Study details" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to study" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Studies" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Study title")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/studies/11/onboarding");
    expect(screen.queryByText("Saved, needs more info")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not started")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /Study details/i })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /Template design/i })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /Upload metadata/i })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /Mappings/i })).toHaveTextContent("4");
    expect(screen.getByRole("button", { name: /Review/i })).toHaveTextContent("5");
  });

  it("honors the step query param when present", async () => {
    renderWizard("/studies/11/onboarding?step=upload");

    expect(await screen.findByRole("heading", { name: "Upload metadata" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/studies/11/onboarding?step=upload");
  });

  it("persists draft state in localStorage scoped to the study", async () => {
    const { unmount } = renderWizard("/studies/11/onboarding");

    fireEvent.change(await screen.findByLabelText("PI name"), { target: { value: "Dr. Example" } });
    expect(screen.getByDisplayValue("Dr. Example")).toBeInTheDocument();

    unmount();

    renderWizard("/studies/11/onboarding");
    expect(await screen.findByDisplayValue("Dr. Example")).toBeInTheDocument();
  });

  it("requires at least one study design element before continuing from template design", async () => {
    renderWizard("/studies/11/onboarding?step=template");

    const continueButton = await screen.findByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /chemical/i }));
    expect(continueButton).not.toBeDisabled();
  });

  it("auto-adds study-design driven columns in the template preview", async () => {
    renderWizard("/studies/11/onboarding?step=template");

    fireEvent.click(await screen.findByRole("button", { name: /chemical/i }));

    expect(await screen.findByText("Auto-added chemical: chemical study design selected")).toBeInTheDocument();
  });

  it("renders the template preview before the template configurator content", async () => {
    renderWizard("/studies/11/onboarding?step=template");

    const previewHeading = await screen.findByText("Template preview");
    const designHeading = screen.getByText("Study design elements");
    const columnsHeading = screen.getByText("Template columns");

    expect(
      Boolean(previewHeading.compareDocumentPosition(designHeading) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Boolean(designHeading.compareDocumentPosition(columnsHeading) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it("renders required and sequencing groups inside the template columns card", async () => {
    renderWizard("/studies/11/onboarding?step=template");

    expect(await screen.findByText("Template columns")).toBeInTheDocument();
    expect(screen.getAllByText("Required").length).toBeGreaterThan(0);

    expect((await screen.findAllByText("Sample ID")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /remove sample id/i })).not.toBeInTheDocument();

    expect(screen.getByText("i5 index")).toBeInTheDocument();
    expect(screen.getByText("i7 index")).toBeInTheDocument();
    expect(screen.getByText("Well ID")).toBeInTheDocument();
    expect(screen.getByText("Sequencing mode")).toBeInTheDocument();
    expect(screen.getByText("Concentration")).toBeInTheDocument();
    expect(screen.getByText("Select for in vitro experiments.")).toBeInTheDocument();
    expect(screen.getByText("Select for in vivo experiments.")).toBeInTheDocument();
  });

  it("shows study-design-derived fields as selected and locked", async () => {
    renderWizard("/studies/11/onboarding?step=template");

    fireEvent.click(await screen.findByRole("button", { name: /chemical/i }));

    const chemicalCheckbox = await screen.findByLabelText("Chemical");
    expect(chemicalCheckbox).toBeChecked();
    expect(chemicalCheckbox).toBeDisabled();
    expect(screen.getByText("Auto-included from study design.")).toBeInTheDocument();
  });

  it("creates removable custom chips through the progressive add control", async () => {
    renderWizard("/studies/11/onboarding?step=template");

    fireEvent.click(await screen.findByRole("button", { name: "Add custom field" }));

    fireEvent.change(screen.getByLabelText("Custom field name"), { target: { value: "plate_layout" } });
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));

    expect(await screen.findByText("plate_layout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove plate_layout/i })).toBeInTheDocument();
  });

  it("keeps the download template button disabled until the template configuration is valid", async () => {
    renderWizard("/studies/11/onboarding?step=template");

    const downloadButton = await screen.findByRole("button", { name: "Download template" });
    expect(downloadButton).toBeDisabled();

    fireEvent.click(downloadButton);
    expect(downloadMetadataTemplate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /chemical/i }));
    await waitFor(() => expect(downloadButton).toBeEnabled());
  });

  it("parses an uploaded sheet, shows a preview, and keeps only one file chooser path", async () => {
    renderWizard("/studies/11/onboarding?step=upload");

    const input = await screen.findByTestId("metadata-file-input");
    const file = new File(["sample_ID,sample_name,group\n,sample-a,control\n"], "metadata.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("sample_ID is required.")).toBeInTheDocument();
    expect(screen.queryByText("Or choose a file")).not.toBeInTheDocument();
    expect(validateMetadataUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        study_id: 11,
        expected_columns: expect.arrayContaining(["sample_ID", "sample_name", "group"]),
      }),
    );
  });

  it("derives mapping column options from uploaded metadata", async () => {
    renderWizard("/studies/11/onboarding?step=upload");

    const input = await screen.findByTestId("metadata-file-input");
    const file = new File(["sample_ID,sample_name,group,plate,solvent_control\n"], "metadata.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText("sample_ID is required.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Mappings" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Treatment level 1"));
    expect(await screen.findByRole("option", { name: "plate" })).toBeInTheDocument();
  });

  it("saves template context with chip selections and finalizes mappings", async () => {
    const view = renderWizard("/studies/11/onboarding?step=template");

    fireEvent.click(await screen.findByRole("button", { name: /treatment/i }));
    fireEvent.change(screen.getByLabelText("Treatment vars"), { target: { value: "group" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(patchStudyOnboardingState).toHaveBeenCalledWith(
        11,
        expect.objectContaining({
          template_context: expect.objectContaining({
            study_design_elements: ["treatment"],
            treatment_vars: ["group"],
          }),
        }),
      ),
    );

    view.unmount();
    renderWizard("/studies/11/onboarding?step=mappings");
    fireEvent.click(await screen.findByLabelText("Treatment level 1"));
    fireEvent.click(await screen.findByRole("option", { name: "group" }));
    fireEvent.click(await screen.findByRole("button", { name: /finalize mappings/i }));

    await waitFor(() => expect(finalizeStudyOnboardingState).toHaveBeenCalledWith(11));
    expect(updateStudy).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        title: "Hepatocyte mercury dose response",
      }),
    );
  });

  it("shows a warning only after successfully saving an incomplete step", async () => {
    renderWizard("/studies/11/onboarding");

    expect(await screen.findByRole("heading", { name: "Study details" })).toBeInTheDocument();
    expect(screen.queryByText("Saved, needs more info")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Template design/i }));

    await screen.findByRole("heading", { name: "Template design" });
    expect(updateStudy).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        title: "Hepatocyte mercury dose response",
        species: null,
        celltype: null,
      }),
    );

    const detailsStep = screen.getByRole("button", { name: /Study details/i });
    expect(within(detailsStep).getByText("Saved, needs more info")).toBeInTheDocument();
    expect(detailsStep).toHaveTextContent("1");
  });

  it("keeps an invalid edited step neutral until it is saved", async () => {
    renderWizard("/studies/11/onboarding?step=template");

    await screen.findByRole("heading", { name: "Template design" });
    fireEvent.click(screen.getByRole("button", { name: /chemical/i }));
    expect(screen.queryByText("Saved, needs more info")).not.toBeInTheDocument();
  });

  it("preserves attempted warning states across reloads from local draft storage", async () => {
    const { unmount } = renderWizard("/studies/11/onboarding");

    await screen.findByRole("heading", { name: "Study details" });
    fireEvent.click(screen.getByRole("button", { name: /Template design/i }));
    await screen.findByRole("heading", { name: "Template design" });
    expect(screen.getByText("Saved, needs more info")).toBeInTheDocument();

    unmount();

    renderWizard("/studies/11/onboarding?step=template");
    await screen.findByRole("heading", { name: "Template design" });
    expect(screen.getByText("Saved, needs more info")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Study details/i })).toHaveTextContent("1");
  });

  it("shows a checkmark only after a step is complete and saved", async () => {
    renderWizard("/studies/11/onboarding");

    await screen.findByRole("heading", { name: "Study details" });
    fireEvent.change(screen.getByLabelText("Study title"), { target: { value: "Updated study title" } });
    fireEvent.change(screen.getByLabelText("Cell type"), { target: { value: "hepatocyte" } });
    fireEvent.click(screen.getByLabelText("Species"));
    fireEvent.click(await screen.findByRole("option", { name: "Human" }));

    fireEvent.click(screen.getByRole("button", { name: /Template design/i }));

    await screen.findByRole("heading", { name: "Template design" });
    const detailsStep = screen.getByRole("button", { name: /Study details/i });
    expect(within(detailsStep).getByText("Complete and saved")).toBeInTheDocument();
    expect(within(detailsStep).queryByText("1")).not.toBeInTheDocument();
    expect(updateStudy).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        title: "Updated study title",
        species: "human",
        celltype: "hepatocyte",
      }),
    );
  });
});
