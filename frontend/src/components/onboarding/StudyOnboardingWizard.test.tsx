import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";

import { StudyOnboardingWizard } from "./StudyOnboardingWizard";
import { fetchLookups } from "../../api/lookups";
import { validateMetadataUpload } from "../../api/metadataValidation";
import { downloadMetadataTemplate, previewMetadataTemplate } from "../../api/metadataTemplates";
import {
  fetchStudyOnboardingState,
  finalizeStudyOnboardingState,
  patchStudyOnboardingState,
} from "../../api/studyOnboarding";
import { deleteStudy, updateStudy } from "../../api/studies";
import { onboardingDraftStorageKey } from "../../lib/studyDeletion";

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

let mockOnboardingState = {
  study_id: 11,
  status: "draft" as const,
  metadata_columns: ["group", "plate", "sample_ID", "sample_name", "solvent_control"],
  validated_rows: [] as Array<Record<string, unknown>>,
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
  group_builder: {
    primary_column: "",
    additional_columns: [] as string[],
    batch_column: "",
  },
  template_context: {
    study_design_elements: [] as string[],
    exposure_label_mode: null as "dose" | "concentration" | "both" | "custom" | null,
    exposure_custom_label: "" as string,
    treatment_vars: [] as string[],
    batch_vars: [] as string[],
    optional_field_keys: [] as string[],
    custom_field_keys: [] as string[],
  },
  config: {
    common: {
      platform: "RNA-Seq",
      instrument_model: "",
      sequenced_by: "",
      biospyder_kit: null,
      dose: null,
      units: "",
    },
    pipeline: {
      mode: "se",
      threads: 8,
    },
    qc: {},
    deseq2: {
      cpus: 4,
    },
  },
  suggested_contrasts: [{ reference_group: "control", comparison_group: "treated" }],
  selected_contrasts: [] as Array<{ reference_group: string; comparison_group: string }>,
  updated_at: "2026-04-08T00:00:00.000Z",
  finalized_at: null as string | null,
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
    fetchStudyOnboardingState: vi.fn(async () => mockOnboardingState),
    patchStudyOnboardingState: vi.fn(async (_studyId: number, payload: Record<string, unknown>) => {
      mockOnboardingState = {
        ...mockOnboardingState,
        ...(payload.template_context ? { template_context: payload.template_context } : {}),
        ...(payload.mappings ? { mappings: { ...mockOnboardingState.mappings, ...payload.mappings } } : {}),
        ...(payload.group_builder ? { group_builder: payload.group_builder as typeof mockOnboardingState.group_builder } : {}),
        ...(payload.selected_contrasts ? { selected_contrasts: payload.selected_contrasts as typeof mockOnboardingState.selected_contrasts } : {}),
        ...(payload.config
          ? {
              config: {
                ...mockOnboardingState.config,
                ...(payload.config as typeof mockOnboardingState.config),
                common: {
                  ...mockOnboardingState.config.common,
                  ...((payload.config as typeof mockOnboardingState.config).common ?? {}),
                },
                pipeline: {
                  ...mockOnboardingState.config.pipeline,
                  ...((payload.config as typeof mockOnboardingState.config).pipeline ?? {}),
                },
                qc: {
                  ...mockOnboardingState.config.qc,
                  ...((payload.config as typeof mockOnboardingState.config).qc ?? {}),
                },
                deseq2: {
                  ...mockOnboardingState.config.deseq2,
                  ...((payload.config as typeof mockOnboardingState.config).deseq2 ?? {}),
                },
              },
            }
          : {}),
      };
      return mockOnboardingState;
    }),
    finalizeStudyOnboardingState: vi.fn(async () => ({
      ...mockOnboardingState,
      status: "final" as const,
      mappings: {
        ...mockOnboardingState.mappings,
        treatment_level_1: mockOnboardingState.template_context.treatment_vars[0] ?? "",
        batch: mockOnboardingState.template_context.batch_vars[0] ?? "",
      },
      finalized_at: "2026-04-08T00:00:00.000Z",
    })),
  };
});

vi.mock("../../api/lookups", async () => {
  const actual = await vi.importActual<typeof import("../../api/lookups")>("../../api/lookups");
  return {
    ...actual,
    fetchLookups: vi.fn(async () => ({
      version: 2,
      metadata_field_definitions: [
        {
          key: "sample_ID",
          label: "Sample ID",
          group: "Core",
          description: "",
          scope: "sample",
          system_key: "sample_ID",
          data_type: "string",
          kind: "standard",
          required: true,
          is_core: true,
          allow_null: false,
          choices: [],
          regex: "^[a-zA-Z0-9-_]*$",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "technical_control",
          label: "Technical control",
          group: "Core",
          description: "",
          scope: "sample",
          system_key: "technical_control",
          data_type: "boolean",
          kind: "standard",
          required: true,
          is_core: true,
          allow_null: false,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "reference_rna",
          label: "Reference RNA",
          group: "Core",
          description: "",
          scope: "sample",
          system_key: "reference_rna",
          data_type: "boolean",
          kind: "standard",
          required: true,
          is_core: true,
          allow_null: false,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "solvent_control",
          label: "Solvent control",
          group: "Core",
          description: "",
          scope: "sample",
          system_key: "solvent_control",
          data_type: "boolean",
          kind: "standard",
          required: true,
          is_core: true,
          allow_null: false,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "sample_name",
          label: "Sample name",
          group: "Core",
          description: "",
          scope: "sample",
          system_key: "sample_name",
          data_type: "string",
          kind: "standard",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "chemical",
          label: "Chemical",
          group: "Toxicology",
          description: "Selecting this auto-adds CASN.",
          scope: "sample",
          system_key: "chemical",
          data_type: "string",
          kind: "standard",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: ["CASN"],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "CASN",
          label: "CAS Number",
          group: "Toxicology",
          description: "",
          scope: "sample",
          system_key: "CASN",
          data_type: "string",
          kind: "standard",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "group",
          label: "Group",
          group: "Study design",
          description: "Primary experimental grouping.",
          scope: "sample",
          system_key: "group",
          data_type: "string",
          kind: "standard",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "plate",
          label: "Plate",
          group: "Study design",
          description: "Primary batch grouping.",
          scope: "sample",
          system_key: "plate",
          data_type: "string",
          kind: "standard",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "dose",
          label: "Dose",
          group: "Toxicology",
          description: "Select for in vivo experiments.",
          scope: "sample",
          system_key: "dose",
          data_type: "float",
          kind: "standard",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "concentration",
          label: "Concentration",
          group: "Toxicology",
          description: "Select for in vitro experiments.",
          scope: "sample",
          system_key: "concentration",
          data_type: "float",
          kind: "standard",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "i5_index",
          label: "i5 index",
          group: "Sequencing",
          description: "i5 sample index.",
          scope: "sample",
          system_key: "i5_index",
          data_type: "string",
          kind: "standard",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "i7_index",
          label: "i7 index",
          group: "Sequencing",
          description: "i7 sample index.",
          scope: "sample",
          system_key: "i7_index",
          data_type: "string",
          kind: "standard",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
        },
        {
          key: "well_id",
          label: "Well ID",
          group: "Sequencing",
          description: "Plate well identifier.",
          scope: "sample",
          system_key: "well_id",
          data_type: "string",
          kind: "standard",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
        {
          key: "animal_cohort",
          label: "Animal Cohort",
          group: "Custom",
          description: "Curated custom metadata field.",
          scope: "sample",
          system_key: "animal_cohort",
          data_type: "string",
          kind: "custom",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: true,
          wizard_featured_order: 20,
        },
        {
          key: "chip_batch",
          label: "Chip Batch",
          group: "Custom",
          description: "Curated custom metadata field.",
          scope: "sample",
          system_key: "chip_batch",
          data_type: "string",
          kind: "custom",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: true,
          wizard_featured_order: 10,
        },
        {
          key: "d",
          label: "d",
          group: "Custom",
          description: "Should not be featured.",
          scope: "sample",
          system_key: "d",
          data_type: "string",
          kind: "custom",
          required: false,
          is_core: false,
          allow_null: true,
          choices: [],
          regex: "",
          min_value: null,
          max_value: null,
          auto_include_keys: [],
          wizard_featured: false,
          wizard_featured_order: 0,
        },
      ],
      lookups: {
        soft: {
          pi_name: { policy: "scoped_select_or_create", values: ["Dr. Example"] },
          researcher_name: { policy: "scoped_select_or_create", values: ["Researcher Example"] },
          celltype: { policy: "scoped_select_or_create", values: ["Hepatocyte"] },
          sequenced_by: { policy: "scoped_select_or_create", values: ["HC Genomics lab", "Yauk lab"] },
        },
        controlled: {
          genome_version: { policy: "admin_managed", values: [] },
          platform: { policy: "admin_managed", values: ["RNA-Seq", "TempO-Seq", "DrugSeq"] },
          instrument_model: { policy: "admin_managed", values: ["Illumina NovaSeq 6000", "Illumina MiSeq"] },
          biospyder_kit: {
            policy: "admin_managed",
            values: [
              { label: "Human Whole Transcriptome 2.1", value: "hwt2-1" },
              { label: "Mouse Whole Transcriptome 1.0", value: "mousewt1-0" },
            ],
          },
        },
      },
      profiling_platforms: [
        {
          id: 1,
          platform_name: "rnaseq_hg38_demo",
          title: "RNA-seq hg38 demonstration platform",
          description: "Seeded profiling platform for admin schema exploration.",
          version: "demo-1",
          technology_type: "RNA-Seq",
          study_type: "TGx",
          species: "human",
          species_label: "Human",
          url: "",
          ext: {},
          study_count: 0,
        },
        {
          id: 2,
          platform_name: "humanWT2_1_brAtten",
          title: "TempO-seq Human WT v2.1, Broad Attenuation",
          description: "Seeded TempO-seq platform record.",
          version: "2.1",
          technology_type: "TempO-Seq",
          study_type: "HTTr",
          species: "human",
          species_label: "Human",
          url: "",
          ext: { biospyder_kit: "hwt2-1", attenuation: "broad" },
          study_count: 0,
        },
        {
          id: 3,
          platform_name: "drugseq_s1500_demo",
          title: "DrugSeq S1500+ demonstration platform",
          description: "Seeded DrugSeq platform record.",
          version: "demo-1",
          technology_type: "DrugSeq",
          study_type: "HTTr",
          species: "human",
          species_label: "Human",
          url: "",
          ext: {},
          study_count: 0,
        },
      ],
    })),
  };
});

vi.mock("../../api/studies", async () => {
  const actual = await vi.importActual<typeof import("../../api/studies")>("../../api/studies");
  return {
    ...actual,
    fetchStudy: vi.fn(async () => mockStudy),
    deleteStudy: vi.fn(async () => undefined),
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
      template_context?: {
        study_design_elements?: string[];
        exposure_label_mode?: "dose" | "concentration" | "both" | "custom" | null;
        exposure_custom_label?: string;
        treatment_vars?: string[];
        batch_vars?: string[];
      };
    }) => {
      const columns = ["sample_ID", "technical_control", "reference_rna", "solvent_control"];
      const autoIncluded: Array<{ key: string; reason: string }> = [];
      const templateContext = payload.template_context ?? {};
      const designElements = templateContext.study_design_elements ?? [];

      if (designElements.includes("chemical")) {
        columns.push("chemical");
        autoIncluded.push({ key: "chemical", reason: "chemical study design selected" });
      }

      if (designElements.includes("exposure")) {
        const exposureMode = payload.template_context?.exposure_label_mode ?? "dose";
        const customExposureLabel = (payload.template_context?.exposure_custom_label ?? "").trim().replace(/\s+/g, "_");
        const exposureColumns =
          exposureMode === "concentration"
            ? ["concentration"]
            : exposureMode === "both"
              ? ["dose", "concentration"]
              : exposureMode === "custom" && customExposureLabel
                ? [customExposureLabel]
                : ["dose"];

        for (const key of exposureColumns) {
          if (!columns.includes(key)) {
            columns.push(key);
            autoIncluded.push({ key, reason: "exposure level selected" });
          }
        }
      }

      for (const key of templateContext.treatment_vars ?? []) {
        if (!columns.includes(key)) {
          columns.push(key);
          autoIncluded.push({ key, reason: "primary experimental variable selected" });
        }
      }

      for (const key of templateContext.batch_vars ?? []) {
        if (!columns.includes(key)) {
          columns.push(key);
          autoIncluded.push({ key, reason: "primary batch variable selected" });
        }
      }

      for (const key of payload.optional_field_keys ?? []) {
        if (key === "sequencing_mode") {
          continue;
        }
        if (!columns.includes(key)) {
          columns.push(key);
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
      blob: new Blob(["sample_ID,technical_control,reference_rna,solvent_control,group\n"], { type: "text/csv" }),
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
              <>
                <StudyOnboardingWizard />
                <LocationDisplay />
              </>
            )}
          />
          <Route path="/studies" element={<LocationDisplay />} />
          <Route path="/studies/:studyId" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudyOnboardingWizard", () => {
  beforeEach(() => {
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
    mockOnboardingState = {
      study_id: 11,
      status: "draft",
      metadata_columns: ["group", "plate", "sample_ID", "sample_name", "solvent_control"],
      validated_rows: [],
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
      group_builder: {
        primary_column: "",
        additional_columns: [],
        batch_column: "",
      },
      template_context: {
        study_design_elements: [],
        exposure_label_mode: null,
        exposure_custom_label: "",
        treatment_vars: [],
        batch_vars: [],
        optional_field_keys: [],
        custom_field_keys: [],
      },
      config: {
        common: {
          platform: "RNA-Seq",
          instrument_model: "",
          sequenced_by: "",
          biospyder_kit: null,
          dose: null,
          units: "",
        },
        pipeline: {
          mode: "se",
          threads: 8,
        },
        qc: {},
        deseq2: {
          cpus: 4,
        },
      },
      suggested_contrasts: [{ reference_group: "control", comparison_group: "treated" }],
      selected_contrasts: [],
      updated_at: "2026-04-08T00:00:00.000Z",
      finalized_at: null,
    };
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the new five-step order", async () => {
    renderWizard("/studies/11/onboarding");

    expect(await screen.findByRole("heading", { name: "Study details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Study details/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Template design/i })).toBeInTheDocument();
    const metadataStepButton = screen.getByRole("button", { name: /Finalize and download template/i });
    expect(metadataStepButton).toBeInTheDocument();
    expect(metadataStepButton).toHaveTextContent("Not started");
    expect(metadataStepButton).not.toHaveTextContent("Complete and saved");
    expect(screen.getByRole("button", { name: /Upload metadata/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review & finalize/i })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/studies/11/onboarding");
  });

  it("preserves the details-step completion state when reloading from local draft storage", async () => {
    localStorage.setItem(
      onboardingDraftStorageKey(11),
      JSON.stringify({
        version: 8,
        studyId: 11,
        updatedAt: "2026-04-08T00:00:00.000Z",
        attempts: {},
        details: {
          title: mockStudy.title,
          piName: "",
          researcherName: "",
          description: "",
        },
        template: {
          species: "human",
          celltype: "hepatocyte",
          context: {
            study_design_elements: [],
            exposure_label_mode: null,
            exposure_custom_label: "",
            treatment_vars: [],
            batch_vars: [],
            optional_field_keys: [],
            custom_field_keys: [],
          },
        },
        groupBuilder: {
          primary_column: "",
          additional_columns: [],
          batch_column: "",
        },
        config: {
          common: {
            platform: "RNA-Seq",
            instrument_model: "NovaSeq 6000",
            sequenced_by: "HC Genomics lab",
            biospyder_kit: null,
            dose: null,
            units: "",
          },
          pipeline: {
            mode: "pe",
            threads: 8,
          },
          qc: {},
          deseq2: {
            cpus: 4,
          },
        },
        upload: {
          fileName: "",
          metadataColumns: [],
          validatedRows: [],
          suggestedContrasts: [],
        },
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
          selected_contrasts: [],
        },
      }),
    );

    renderWizard("/studies/11/onboarding");

    expect(await screen.findByRole("heading", { name: "Study details" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Paired-end" })).toHaveClass("bg-primary"));
    expect(screen.getByRole("button", { name: "Single-end" })).not.toHaveClass("bg-primary");
  });

  it("shows sequencing config fields and derives TempO-Seq kit from the platform definition", async () => {
    renderWizard("/studies/11/onboarding");

    expect(await screen.findByText("Sequencing setup")).toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "Platform" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Sequencing mode" })).toBeInTheDocument();
    expect(screen.getByLabelText("Instrument model")).toBeInTheDocument();
    expect(screen.getByLabelText("Sequenced by")).toBeInTheDocument();
    expect(screen.queryByText("Config summary")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Platform definition")).toBeInTheDocument();
    expect(screen.queryByLabelText("Biospyder kit")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "TempO-Seq" }));

    expect(await screen.findByText(/humanWT2_1_brAtten/)).toBeInTheDocument();
    expect(screen.getByText(/BioSpyder kit hwt2-1/)).toBeInTheDocument();
  });

  it("places the description field above sequencing setup on the study details step", async () => {
    renderWizard("/studies/11/onboarding");

    const description = await screen.findByLabelText("Description");
    const sequencingHeading = screen.getByText("Sequencing setup");
    const descriptionField = description.closest(".grid");
    const descriptionPosition = descriptionField?.compareDocumentPosition(sequencingHeading) ?? 0;

    expect(descriptionPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a delete-study action on the first step and deletes the study through the confirmation dialog", async () => {
    renderWizard("/studies/11/onboarding");

    const deleteTrigger = await screen.findByRole("button", { name: /delete study/i });
    fireEvent.click(deleteTrigger);

    expect(await screen.findByRole("dialog", { name: /delete study/i })).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: /^delete study$/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type the study title/i), {
      target: { value: mockStudy.title },
    });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(deleteStudy).toHaveBeenCalled());
    expect(vi.mocked(deleteStudy).mock.calls.at(-1)?.[0]).toBe(11);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/studies"));
  });

  it("keeps the delete-study action available on later onboarding steps", async () => {
    renderWizard("/studies/11/onboarding?step=design");

    expect(await screen.findByRole("button", { name: /delete study/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("falls back to default platform and sequenced-by options when lookup buckets are empty", async () => {
    vi.mocked(fetchLookups).mockResolvedValueOnce({
      version: 2,
      metadata_field_definitions: [],
      lookups: {
        soft: {
          pi_name: { policy: "scoped_select_or_create", values: [] },
          researcher_name: { policy: "scoped_select_or_create", values: [] },
          celltype: { policy: "scoped_select_or_create", values: [] },
          sequenced_by: { policy: "scoped_select_or_create", values: [] },
        },
        controlled: {
          genome_version: { policy: "admin_managed", values: [] },
          platform: { policy: "admin_managed", values: [] },
          instrument_model: { policy: "admin_managed", values: [] },
          biospyder_kit: { policy: "admin_managed", values: [] },
        },
      },
    });

    renderWizard("/studies/11/onboarding");

    expect(await screen.findByRole("button", { name: "TempO-Seq" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RNA-Seq" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DrugSeq" })).toBeInTheDocument();

    const sequencedBy = screen.getByLabelText("Sequenced by");
    expect(sequencedBy).toHaveAttribute("list");
    const listId = sequencedBy.getAttribute("list");
    expect(listId).toBeTruthy();
    const datalist = document.getElementById(String(listId));
    expect(datalist).not.toBeNull();
    expect(datalist?.querySelector('option[value="HC Genomics lab"]')).not.toBeNull();
    expect(datalist?.querySelector('option[value="HC foods lab"]')).not.toBeNull();
    expect(datalist?.querySelector('option[value="Yauk lab"]')).not.toBeNull();
  });

  it("prompts for treatment and batch variable names only when those design elements are selected", async () => {
    renderWizard("/studies/11/onboarding?step=design");

    expect(await screen.findByRole("heading", { name: "Template design" })).toBeInTheDocument();
    expect(screen.queryByText("Label exposure as")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Treatment vars")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Batch vars")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Treatment/i }));
    expect(await screen.findByLabelText("Treatment vars")).toBeInTheDocument();
    expect(screen.queryByLabelText("Batch vars")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Batch/i }));
    expect(await screen.findByLabelText("Batch vars")).toBeInTheDocument();
  });

  it("reveals exposure label choices only when exposure level is selected", async () => {
    renderWizard("/studies/11/onboarding?step=design");

    expect(await screen.findByRole("heading", { name: "Template design" })).toBeInTheDocument();
    expect(screen.queryByText("Label exposure as")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Exposure level/i }));

    expect(await screen.findByText("Label exposure as")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Dose" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Concentration" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Both / mixed study" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Custom" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("Custom exposure label")).not.toBeInTheDocument();
  });

  it("allows switching the exposure label mode and entering a custom label", async () => {
    renderWizard("/studies/11/onboarding?step=design");

    fireEvent.click(await screen.findByRole("button", { name: /Exposure level/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Concentration" }));
    expect(screen.getByRole("radio", { name: "Concentration" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    expect(screen.getByLabelText("Custom exposure label")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Custom exposure label"), { target: { value: "Nominal concentration" } });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(patchStudyOnboardingState).toHaveBeenCalledWith(
        11,
        expect.objectContaining({
          template_context: expect.objectContaining({
            study_design_elements: expect.arrayContaining(["exposure"]),
            exposure_label_mode: "custom",
            exposure_custom_label: "Nominal concentration",
          }),
        }),
      ),
    );
  });

  it("requires treatment naming and supports multiple batch variables before continuing from template design", async () => {
    renderWizard("/studies/11/onboarding?step=design");

    const continueButton = await screen.findByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Treatment/i }));
    expect(continueButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Treatment vars"), { target: { value: "radiation" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a treatment variable" }));
    expect(continueButton).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /Batch/i }));
    expect(continueButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Batch vars"), { target: { value: "plate" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a batch variable" }));
    expect(continueButton).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Batch vars"), { target: { value: "operator" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a batch variable" }));

    expect(screen.getByText("plate")).toBeInTheDocument();
    expect(screen.getByText("operator")).toBeInTheDocument();
  });

  it("shows blocking design guidance inside the relevant cards", async () => {
    renderWizard("/studies/11/onboarding?step=design");

    expect(await screen.findByRole("heading", { name: "Template design" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/select at least one study design element/i);

    fireEvent.click(screen.getByRole("button", { name: /Treatment/i }));

    expect(screen.queryByText(/select at least one study design element/i)).not.toBeInTheDocument();
    expect(screen.getByText(/add at least one treatment variable/i)).toHaveClass("text-destructive");
    expect(screen.queryByText("No values added yet.")).not.toBeInTheDocument();
  });

  it("requires exposure level when chemical is selected", async () => {
    renderWizard("/studies/11/onboarding?step=design");

    const continueButton = await screen.findByRole("button", { name: "Continue" });
    fireEvent.click(screen.getByRole("button", { name: /Chemical/i }));

    expect(continueButton).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/select exposure level for chemical studies/i);

    fireEvent.click(screen.getByRole("button", { name: /Exposure level/i }));

    await waitFor(() => expect(continueButton).toBeEnabled());
    expect(screen.queryByText(/select exposure level for chemical studies/i)).not.toBeInTheDocument();
  });

  it("requires a custom exposure label before continuing when custom mode is selected", async () => {
    renderWizard("/studies/11/onboarding?step=design");

    const continueButton = await screen.findByRole("button", { name: "Continue" });

    fireEvent.click(screen.getByRole("button", { name: /Exposure level/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));

    expect(screen.getByLabelText("Custom exposure label")).toBeInTheDocument();
    expect(continueButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Custom exposure label"), { target: { value: "Nominal concentration" } });
    expect(continueButton).toBeEnabled();
  });

  it("keeps sequencing mode out of finalize and download template and labels sequencing fields as identifiers", async () => {
    mockOnboardingState.template_context = {
      study_design_elements: ["chemical", "exposure"],
      exposure_label_mode: "dose",
      exposure_custom_label: "",
      treatment_vars: ["group"],
      batch_vars: ["plate"],
      optional_field_keys: ["i5_index", "sequencing_mode"],
      custom_field_keys: [],
    };

    renderWizard("/studies/11/onboarding?step=metadata");

    expect(await screen.findByRole("heading", { name: "Finalize and download template" })).toBeInTheDocument();
    expect(await screen.findByText("i5 index")).toBeInTheDocument();
    expect(screen.getByText("i7 index")).toBeInTheDocument();
    expect(screen.getByText("Well ID")).toBeInTheDocument();
    expect(screen.queryByText("Sequencing mode")).not.toBeInTheDocument();
  });

  it("checks sequencing identifier fields by default on finalize and download template", async () => {
    mockOnboardingState.template_context = {
      study_design_elements: ["chemical"],
      exposure_label_mode: null,
      exposure_custom_label: "",
      treatment_vars: ["group"],
      batch_vars: ["plate"],
      optional_field_keys: [],
      custom_field_keys: [],
    };

    renderWizard("/studies/11/onboarding?step=metadata");

    expect(await screen.findByRole("heading", { name: "Finalize and download template" })).toBeInTheDocument();
    expect(await screen.findByTestId("template-field-checkbox-i5_index")).toHaveAttribute("data-state", "checked");
    expect(await screen.findByTestId("template-field-checkbox-i7_index")).toHaveAttribute("data-state", "checked");
    expect(await screen.findByTestId("template-field-checkbox-well_id")).toHaveAttribute("data-state", "checked");
  });

  it("limits common fields to the curated default set and keeps inline custom field entry", async () => {
    renderWizard("/studies/11/onboarding?step=metadata");

    expect(await screen.findByRole("heading", { name: "Finalize and download template" })).toBeInTheDocument();
    expect(screen.getByText("Common fields")).toBeInTheDocument();
    expect(screen.getByText("Additional fields")).toBeInTheDocument();
    expect(screen.queryByTestId("template-field-checkbox-CASN")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add custom field/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Custom field name")).toBeInTheDocument();
  });

  it("shows only backend-featured custom chips ordered by featured order", async () => {
    const lookups = await vi.mocked(fetchLookups).getMockImplementation()?.();
    if (!lookups) {
      throw new Error("Missing default lookup mock implementation.");
    }
    vi.mocked(fetchLookups).mockResolvedValueOnce(lookups);

    renderWizard("/studies/11/onboarding?step=metadata");

    expect(await screen.findByRole("heading", { name: "Finalize and download template" })).toBeInTheDocument();

    const chipBatch = await screen.findByText("Chip Batch");
    const animalCohort = await screen.findByText("Animal Cohort");

    expect(chipBatch.compareDocumentPosition(animalCohort) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("d")).not.toBeInTheDocument();
  });

  it("adds ad hoc custom fields inline without turning them into featured chips", async () => {
    renderWizard("/studies/11/onboarding?step=metadata");

    const input = await screen.findByLabelText("Custom field name");
    fireEvent.change(input, { target: { value: "Dose note" } });
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));

    expect(await screen.findByText("Dose_note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dose note" })).not.toBeInTheDocument();
  });

  it("keeps showing selected columns when preview refresh fails after selecting an additional field chip", async () => {
    renderWizard("/studies/11/onboarding?step=metadata");

    expect(await screen.findByRole("heading", { name: "Finalize and download template" })).toBeInTheDocument();
    expect(await screen.findByText("sample_ID")).toBeInTheDocument();

    vi.mocked(previewMetadataTemplate).mockRejectedValueOnce(new Error("Bad gateway while refreshing preview."));

    fireEvent.click(screen.getByRole("button", { name: "Chip Batch" }));

    expect(await screen.findByText(/bad gateway while refreshing preview/i)).toBeInTheDocument();
    expect(screen.queryByText("Template preview failed.")).not.toBeInTheDocument();
    expect(screen.getByText("sample_ID")).toBeInTheDocument();
  });

  it("validates uploads against the finalized template without sequencing_mode", async () => {
    mockOnboardingState.template_context = {
      study_design_elements: ["chemical", "exposure"],
      exposure_label_mode: "dose",
      exposure_custom_label: "",
      treatment_vars: ["group"],
      batch_vars: ["plate"],
      optional_field_keys: ["i5_index"],
      custom_field_keys: [],
    };

    renderWizard("/studies/11/onboarding?step=upload");

    const input = await screen.findByTestId("metadata-file-input");
    const file = new File(["sample_ID,sample_name,group,plate,solvent_control\n"], "metadata.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(validateMetadataUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          study_id: 11,
          expected_columns: expect.arrayContaining(["sample_ID", "technical_control", "reference_rna", "solvent_control", "group", "plate"]),
        }),
      ),
    );

    const expectedColumns = (validateMetadataUpload as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].expected_columns as string[];
    expect(expectedColumns).not.toContain("sequencing_mode");
  });

  it("keeps derived groups visible on review immediately after upload before onboarding-state refetch completes", async () => {
    mockOnboardingState.metadata_columns = [];
    mockOnboardingState.validated_rows = [];
    vi.mocked(validateMetadataUpload).mockResolvedValueOnce({
      valid: true,
      issues: [],
      columns: ["sample_ID", "sample_name", "group", "plate", "solvent_control"],
      validated_rows: [
        {
          sample_ID: "sample-1",
          sample_name: "Control",
          technical_control: false,
          reference_rna: false,
          solvent_control: true,
          metadata: { group: "control", plate: "plate-1" },
          group: "control",
          plate: "plate-1",
        },
        {
          sample_ID: "sample-2",
          sample_name: "Dose",
          technical_control: false,
          reference_rna: false,
          solvent_control: false,
          metadata: { group: "treated", plate: "plate-1" },
          group: "treated",
          plate: "plate-1",
        },
      ],
      suggested_contrasts: [{ reference_group: "control", comparison_group: "treated" }],
    });

    renderWizard("/studies/11/onboarding?step=upload");

    const input = await screen.findByTestId("metadata-file-input");
    const file = new File(["sample_ID,sample_name,group,plate,solvent_control\n"], "metadata.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(validateMetadataUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          study_id: 11,
        }),
      ),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Review & finalize" })).toBeInTheDocument();
    expect(await screen.findByText("Computed group = group")).toBeInTheDocument();
    expect(screen.getAllByText("control").length).toBeGreaterThan(0);
    expect(screen.getAllByText("treated").length).toBeGreaterThan(0);
    expect(screen.getByText("treated vs control")).toBeInTheDocument();
  });

  it("prefills finalize mappings from the primary variables and finalizes onboarding", async () => {
    mockOnboardingState.template_context = {
      study_design_elements: ["chemical"],
      treatment_vars: ["group"],
      batch_vars: ["plate"],
      optional_field_keys: [],
      custom_field_keys: [],
    };
    mockOnboardingState.metadata_columns = ["group", "plate", "sample_ID", "technical_control", "reference_rna", "solvent_control"];

    renderWizard("/studies/11/onboarding?step=finalize");

    expect(await screen.findByRole("heading", { name: "Review & finalize" })).toBeInTheDocument();
    expect(await screen.findByText("Primary grouping variable")).toBeInTheDocument();
    expect(await screen.findByText("Computed group = group")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Batch column" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate outputs/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Finalize onboarding/i }));

    await waitFor(() =>
      expect(patchStudyOnboardingState).toHaveBeenCalledWith(
        11,
        expect.objectContaining({
          group_builder: expect.objectContaining({
            primary_column: "group",
            batch_column: "plate",
          }),
          mappings: expect.objectContaining({
            treatment_level_1: "group",
            batch: "plate",
          }),
        }),
      ),
    );
    expect(finalizeStudyOnboardingState).toHaveBeenCalledWith(11);
    expect(updateStudy).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        title: "Hepatocyte mercury dose response",
      }),
    );
    expect(await screen.findByTestId("location")).toHaveTextContent("/studies/11");
  });

  it("keeps template steps checked after final review autosaves mappings", async () => {
    mockOnboardingState.template_context = {
      study_design_elements: ["chemical", "exposure"],
      exposure_label_mode: "dose",
      exposure_custom_label: "",
      treatment_vars: ["group"],
      batch_vars: ["plate"],
      optional_field_keys: ["i5_index", "i7_index", "well_id"],
      custom_field_keys: [],
    };
    mockOnboardingState.metadata_columns = ["group", "plate", "sample_ID", "technical_control", "reference_rna", "solvent_control"];

    renderWizard("/studies/11/onboarding?step=finalize");

    expect(await screen.findByRole("heading", { name: "Review & finalize" })).toBeInTheDocument();

    await waitFor(() => expect(patchStudyOnboardingState).toHaveBeenCalled());
    const lastPayload = vi.mocked(patchStudyOnboardingState).mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(lastPayload).not.toHaveProperty("template_context");
    expect(screen.getByRole("button", { name: /Template design/i })).toHaveTextContent("Complete and saved");
    expect(screen.getByRole("button", { name: /Finalize and download template/i })).toHaveTextContent("Complete and saved");
    expect(await screen.findByText("Your work is saved.")).toBeInTheDocument();
  });

  it("recomputes derived group previews and suggested contrasts from selected grouping columns", async () => {
    mockOnboardingState.metadata_columns = [
      "sample_ID",
      "sample_name",
      "dose",
      "culture",
      "plate",
      "solvent_control",
      "technical_control",
      "reference_rna",
    ];
    mockOnboardingState.validated_rows = [
      {
        sample_ID: "sample-1",
        sample_name: "Control 2D",
        dose: "C",
        culture: "2D",
        plate: "plate-1",
        solvent_control: true,
        technical_control: false,
        reference_rna: false,
      },
      {
        sample_ID: "sample-2",
        sample_name: "Dose 2D",
        dose: "1uM",
        culture: "2D",
        plate: "plate-1",
        solvent_control: false,
        technical_control: false,
        reference_rna: false,
      },
      {
        sample_ID: "sample-3",
        sample_name: "Control 3D",
        dose: "C",
        culture: "3D",
        plate: "plate-2",
        solvent_control: true,
        technical_control: false,
        reference_rna: false,
      },
      {
        sample_ID: "sample-4",
        sample_name: "Dose 3D",
        dose: "2uM",
        culture: "3D",
        plate: "plate-2",
        solvent_control: false,
        technical_control: false,
        reference_rna: false,
      },
    ];

    renderWizard("/studies/11/onboarding?step=finalize");

    expect(await screen.findByText("Primary grouping variable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: /primary grouping variable/i }));
    fireEvent.click(await screen.findByRole("option", { name: "dose" }));

    fireEvent.click(await screen.findByText("Select additional columns to refine grouping"));
    fireEvent.click(await screen.findByText("culture"));

    expect(await screen.findByText("Computed group = dose + culture")).toBeInTheDocument();
    expect(screen.getAllByText("C_2D").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1uM_2D").length).toBeGreaterThan(0);
    expect(screen.getAllByText("C_3D").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2uM_3D").length).toBeGreaterThan(0);
    expect(screen.getByText("1uM_2D vs C_2D")).toBeInTheDocument();
    expect(screen.getByText("2uM_3D vs C_3D")).toBeInTheDocument();
  });

  it("downloads the finalized metadata template from the dedicated metadata step", async () => {
    mockOnboardingState.template_context = {
      study_design_elements: ["chemical", "exposure"],
      exposure_label_mode: "dose",
      exposure_custom_label: "",
      treatment_vars: ["group"],
      batch_vars: [],
      optional_field_keys: ["i5_index"],
      custom_field_keys: [],
    };

    renderWizard("/studies/11/onboarding?step=metadata");

    const downloadButton = await screen.findByRole("button", { name: "Download template" });
    await waitFor(() => expect(downloadButton).not.toBeDisabled());
    fireEvent.click(downloadButton);

    await waitFor(() => expect(downloadMetadataTemplate).toHaveBeenCalled());
  });

  it("warns before continuing to upload when the current template has not been downloaded", async () => {
    mockOnboardingState.template_context = {
      study_design_elements: ["chemical", "exposure"],
      exposure_label_mode: "dose",
      exposure_custom_label: "",
      treatment_vars: [],
      batch_vars: [],
      optional_field_keys: [],
      custom_field_keys: [],
    };

    renderWizard("/studies/11/onboarding?step=metadata");

    const continueButton = await screen.findByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    expect(await screen.findByRole("dialog", { name: /download this template before upload/i })).toBeInTheDocument();
    expect(screen.getByText(/the next step expects rows from this exact template/i)).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/studies/11/onboarding?step=metadata");

    fireEvent.click(screen.getByRole("button", { name: /continue anyway/i }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/studies/11/onboarding?step=upload"));
  });

  it("marks the downloaded template stale when template selections change", async () => {
    mockOnboardingState.template_context = {
      study_design_elements: ["chemical", "exposure"],
      exposure_label_mode: "dose",
      exposure_custom_label: "",
      treatment_vars: [],
      batch_vars: [],
      optional_field_keys: [],
      custom_field_keys: [],
    };

    renderWizard("/studies/11/onboarding?step=metadata");

    const downloadButton = await screen.findByRole("button", { name: "Download template" });
    await waitFor(() => expect(downloadButton).toBeEnabled());
    fireEvent.click(downloadButton);
    await waitFor(() => expect(downloadMetadataTemplate).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole("button", { name: "Chip Batch" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("dialog", { name: /download this template before upload/i })).toBeInTheDocument();
  });
});
