import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { StudyWorkspacePage } from "./StudyWorkspacePage";
import { createAssay, fetchAssays } from "../api/assays";
import { fetchStudyExplorerSummary } from "../api/studyExplorer";
import { deleteStudy, downloadStudyGeoMetadataCsv } from "../api/studies";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const authMock = vi.hoisted(() => ({
  role: "admin" as "admin" | "client",
}));

vi.mock("../api/studies", async () => {
  const actual = await vi.importActual<typeof import("../api/studies")>("../api/studies");
  return {
    ...actual,
    fetchStudy: vi.fn(async () => ({
      id: 11,
      project: 7,
      project_title: "Mercury tox study",
      title: "Hepatocyte mercury dose response",
      species: "human",
      celltype: "hepatocyte",
      treatment_var: "mercury",
      batch_var: "batch-1",
    })),
    deleteStudy: vi.fn(async () => undefined),
    downloadStudyGeoMetadataCsv: vi.fn(async () => ({
      blob: new Blob(["geo"]),
      filename: "geo_metadata_hepatocyte_mercury_dose_response.csv",
    })),
  };
});

vi.mock("../api/projects", async () => {
  const actual = await vi.importActual<typeof import("../api/projects")>("../api/projects");
  return {
    ...actual,
    fetchProject: vi.fn(async () => ({
      id: 7,
      title: "Mercury tox study",
      pi_name: "Dr. Example",
      description: "Study collaboration description",
      owner: null,
    })),
  };
});

vi.mock("../api/studyOnboarding", async () => {
  const actual = await vi.importActual<typeof import("../api/studyOnboarding")>("../api/studyOnboarding");
  return {
    ...actual,
    fetchStudyOnboardingState: vi.fn(async () => ({
      study_id: 11,
      status: "draft" as const,
      metadata_columns: ["sample_ID", "group", "dose", "chemical"],
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
        primary_column: "group",
        additional_columns: [],
        batch_column: "",
      },
      template_context: {
        study_design_elements: ["chemical", "exposure"],
        exposure_label_mode: "dose",
        exposure_custom_label: "",
        treatment_vars: ["group"],
        batch_vars: [],
        optional_field_keys: ["chemical", "dose"],
        custom_field_keys: [],
      },
      template_columns: ["sample_ID", "group", "dose", "chemical"],
      config: {
        common: {},
        pipeline: {},
        qc: {},
        deseq2: {},
      },
      suggested_contrasts: [],
      selected_contrasts: [],
      updated_at: "2026-04-10T12:00:00Z",
      finalized_at: null,
    })),
  };
});

vi.mock("../api/studyExplorer", async () => {
  const actual = await vi.importActual<typeof import("../api/studyExplorer")>("../api/studyExplorer");
  return {
    ...actual,
    fetchStudyExplorerSummary: vi.fn(async () => ({
      study_id: 11,
      readiness: {
        status: "warning",
        label: "Needs attention",
        updated_at: "2026-04-10T12:00:00Z",
        finalized_at: null,
      },
      sample_summary: {
        total: 1,
        technical_controls: 0,
        reference_rna_controls: 0,
        solvent_controls: 0,
      },
      assay_summary: {
        total: 0,
        samples_with_assays: 0,
        samples_missing_assays: 1,
        platforms: [],
      },
      design_summary: {
        groups: [{ value: "control", count: 1 }],
        doses: [{ value: "0", count: 1 }],
        chemicals: [{ value: "None", count: 1 }],
        metadata_columns: ["sample_ID", "group", "dose", "chemical"],
        treatment_vars: ["group"],
        batch_vars: [],
      },
      contrast_summary: {
        selected_count: 0,
        suggested_count: 0,
        selected: [],
        suggested: [],
      },
      config_summary: {
        platform: "RNA-Seq",
        sequencing_mode: "se",
        instrument_model: "",
        sequenced_by: "",
        biospyder_kit: null,
        can_download_config: false,
      },
      geo_summary: {
        can_download_csv: true,
        populated_field_count: 12,
        total_field_count: 24,
        manual_field_labels: ["raw file", "processed data file", "extract protocol"],
      },
      blocking_issues: [
        {
          code: "missing_assays",
          severity: "warning",
          message: "1 sample is missing assay metadata.",
          action_label: "Filter missing assays",
          filter: { assay_status: "missing" },
        },
      ],
    })),
  };
});

vi.mock("../api/samples", async () => {
  const actual = await vi.importActual<typeof import("../api/samples")>("../api/samples");
  return {
    ...actual,
    fetchSamples: vi.fn(async () => ({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 101,
          study: 11,
          sample_ID: "S-001",
          sample_name: "Sample 1",
          description: "",
          technical_control: false,
          reference_rna: false,
          solvent_control: false,
          metadata: {
            group: "control",
            dose: "0",
            chemical: "",
            chemical_longname: "",
          },
        },
      ],
    })),
  };
});

vi.mock("../api/assays", async () => {
  const actual = await vi.importActual<typeof import("../api/assays")>("../api/assays");
  return {
    ...actual,
    fetchAssays: vi.fn(async () => ({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })),
    createAssay: vi.fn(async () => ({
      id: 501,
      sample: 101,
      platform: "rna_seq" as const,
      genome_version: "mm10",
      quantification_method: "raw_counts",
    })),
  };
});

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: {
      username: "mmeier",
      profile: { role: authMock.role },
    },
  }),
}));

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/studies/:studyId" element={<StudyWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudyWorkspacePage", () => {
  beforeEach(() => {
    authMock.role = "admin";
  });

  it("renders an overview-first operational workbench", async () => {
    renderPage("/studies/11");

    expect(await screen.findByRole("heading", { name: /hepatocyte mercury dose response/i })).toBeInTheDocument();
    expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /overview/i })).toHaveAttribute("href", "/studies/11");
    expect(screen.getByRole("link", { name: /samples/i })).toHaveAttribute("href", "/studies/11?view=samples");
    expect(screen.getByRole("link", { name: /^contrasts$/i })).toHaveAttribute("href", "/studies/11?view=contrasts");
    expect(screen.getByText(/attention queue/i)).toBeInTheDocument();
    expect(screen.getByText(/1 sample is missing processing metadata/i)).toBeInTheDocument();
    expect(screen.getByText(/study design overview/i)).toBeInTheDocument();
    expect(screen.getByText(/geo submission helper/i)).toBeInTheDocument();
    expect(screen.getByText(/ready with blanks/i)).toBeInTheDocument();
    expect(screen.getByText(/known fields: 12\/24 populated/i)).toBeInTheDocument();
    expect(screen.getByText(/raw file, processed data file, extract protocol/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download geo csv/i })).toBeInTheDocument();
    expect(screen.queryByText(/sample explorer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/contrasts and config handoff/i)).not.toBeInTheDocument();
  });

  it("renders samples as a separate workspace view", async () => {
    renderPage("/studies/11?view=samples");

    expect(await screen.findByText(/sample explorer/i)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /sample id/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /sample name/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /group/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /dose/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /controls/i })).toBeInTheDocument();
    expect(screen.getByText(/showing 1-1 of 1/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /selected sample/i })).not.toBeInTheDocument();
    expect(screen.getByText(/select a sample row to open full metadata and processing details/i)).toBeInTheDocument();
    expect(screen.getAllByText("S-001")).toHaveLength(1);
    expect(screen.queryByText(/group: control/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/long chemical name/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no processing metadata recorded for this sample/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/platform/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/genome version/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/quantification method/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add samples/i })).toBeInTheDocument();
  });

  it("opens processing metadata creation from the admin-only sample inspector actions menu", async () => {
    vi.mocked(fetchAssays)
      .mockResolvedValueOnce({
        count: 0,
        next: null,
        previous: null,
        results: [],
      })
      .mockResolvedValueOnce({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 501,
            sample: 101,
            platform: "rna_seq",
            genome_version: "mm10",
            quantification_method: "raw_counts",
          },
        ],
      });

    renderPage("/studies/11?view=samples");

    expect(await screen.findByText(/sample explorer/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/platform/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("cell", { name: "S-001" }));
    expect(await screen.findByRole("dialog", { name: /sample inspector/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^processing metadata$/i })).toBeInTheDocument();
    expect(screen.getByText(/no processing metadata recorded for this sample/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sample actions/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /apply processing metadata/i }));

    expect(await screen.findByRole("dialog", { name: /apply processing metadata/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/platform/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/genome version/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/quantification method/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/genome version/i), { target: { value: "mm10" } });
    fireEvent.change(screen.getByLabelText(/quantification method/i), { target: { value: "raw_counts" } });
    fireEvent.click(screen.getByRole("button", { name: /^apply processing metadata$/i }));

    await waitFor(() => {
      expect(createAssay).toHaveBeenCalled();
    });
    expect(vi.mocked(createAssay).mock.calls.at(-1)?.[0]).toEqual({
      sample: 101,
      platform: "rna_seq",
      genome_version: "mm10",
      quantification_method: "raw_counts",
    });
    expect(await screen.findByText(/mm10 \/ raw_counts/i)).toBeInTheDocument();
  });

  it("hides sample processing metadata actions from client users", async () => {
    authMock.role = "client";

    renderPage("/studies/11?view=samples");

    expect(await screen.findByText(/sample explorer/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("cell", { name: "S-001" }));
    expect(await screen.findByRole("dialog", { name: /sample inspector/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sample actions/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/apply processing metadata/i)).not.toBeInTheDocument();
  });

  it("renders contrasts as a separate workspace view", async () => {
    renderPage("/studies/11?view=contrasts");

    expect(await screen.findByText(/contrasts and config handoff/i)).toBeInTheDocument();
    expect(screen.queryByText(/geo submission helper/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /review contrasts/i })).toHaveAttribute("href", "/studies/11/onboarding?step=finalize");
    expect(screen.getByRole("button", { name: /more study actions/i })).toBeInTheDocument();
  });

  it("renders collaboration as a separate workspace view", async () => {
    renderPage("/studies/11?view=collaboration");

    expect(await screen.findByText(/collaboration context/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more study actions/i })).toBeInTheDocument();
  });

  it("syncs sample filters with route search params", async () => {
    renderPage("/studies/11?view=samples&assay_status=missing");

    expect(await screen.findByText(/sample explorer/i)).toBeInTheDocument();
    expect(screen.getAllByText(/missing processing metadata/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    await waitFor(() => {
      expect(screen.queryByText(/^Missing processing metadata$/i)).not.toBeInTheDocument();
    });
  });

  it("opens the intake tools from add samples", async () => {
    renderPage("/studies/11");

    fireEvent.click(await screen.findByRole("button", { name: /add samples/i }));
    expect(await screen.findByText(/sample metadata onboarding/i)).toBeInTheDocument();
  });

  it("hides continue onboarding when the study is ready", async () => {
    vi.mocked(fetchStudyExplorerSummary).mockResolvedValueOnce({
      study_id: 11,
      readiness: {
        status: "ready",
        label: "Ready",
        updated_at: "2026-04-10T12:00:00Z",
        finalized_at: "2026-04-10T12:00:00Z",
      },
      sample_summary: {
        total: 3,
        technical_controls: 0,
        reference_rna_controls: 0,
        solvent_controls: 1,
      },
      assay_summary: {
        total: 3,
        samples_with_assays: 3,
        samples_missing_assays: 0,
        platforms: [{ value: "rna_seq", count: 3 }],
      },
      design_summary: {
        groups: [{ value: "control", count: 3 }],
        doses: [{ value: "0", count: 3 }],
        chemicals: [{ value: "vehicle", count: 3 }],
        metadata_columns: ["sample_ID", "group", "dose", "chemical"],
        treatment_vars: ["group"],
        batch_vars: [],
      },
      contrast_summary: {
        selected_count: 1,
        suggested_count: 1,
        selected: [{ reference_group: "control", comparison_group: "treated" }],
        suggested: [{ reference_group: "control", comparison_group: "treated" }],
      },
      config_summary: {
        platform: "RNA-Seq",
        sequencing_mode: "se",
        instrument_model: "Illumina NovaSeq 6000",
        sequenced_by: "HC Genomics lab",
        biospyder_kit: null,
        can_download_config: true,
      },
      geo_summary: {
        can_download_csv: true,
        populated_field_count: 14,
        total_field_count: 24,
        manual_field_labels: ["raw file", "processed data file"],
      },
      blocking_issues: [],
    });

    renderPage("/studies/11");

    expect(await screen.findByText(/Hepatocyte mercury dose response/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /continue onboarding/i })).not.toBeInTheDocument();
  });

  it("surfaces lower-frequency study actions in a local overflow menu", async () => {
    renderPage("/studies/11");

    fireEvent.click(await screen.findByRole("button", { name: /more study actions/i }));

    expect(await screen.findByRole("menuitem", { name: /open collaboration/i })).toHaveAttribute(
      "href",
      "/collaborations/7",
    );
    expect(screen.getByRole("menuitem", { name: /download config bundle/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /download geo csv/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /delete study/i })).toBeInTheDocument();
  });

  it("downloads the GEO CSV from the study actions menu", async () => {
    renderPage("/studies/11");

    fireEvent.click(await screen.findByRole("button", { name: /more study actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /download geo csv/i }));

    await waitFor(() => {
      expect(vi.mocked(downloadStudyGeoMetadataCsv).mock.calls.at(-1)?.[0]).toBe(11);
    });
  });

  it("disables the GEO CSV button when there are no exportable rows", async () => {
    vi.mocked(fetchStudyExplorerSummary).mockResolvedValueOnce({
      study_id: 11,
      readiness: {
        status: "warning",
        label: "Needs attention",
        updated_at: "2026-04-10T12:00:00Z",
        finalized_at: null,
      },
      sample_summary: {
        total: 0,
        technical_controls: 0,
        reference_rna_controls: 0,
        solvent_controls: 0,
      },
      assay_summary: {
        total: 0,
        samples_with_assays: 0,
        samples_missing_assays: 0,
        platforms: [],
      },
      design_summary: {
        groups: [],
        doses: [],
        chemicals: [],
        metadata_columns: [],
        treatment_vars: [],
        batch_vars: [],
      },
      contrast_summary: {
        selected_count: 0,
        suggested_count: 0,
        selected: [],
        suggested: [],
      },
      config_summary: {
        platform: "RNA-Seq",
        sequencing_mode: "",
        instrument_model: "",
        sequenced_by: "",
        biospyder_kit: null,
        can_download_config: false,
      },
      geo_summary: {
        can_download_csv: false,
        populated_field_count: 0,
        total_field_count: 24,
        manual_field_labels: ["raw file", "processed data file", "protocols"],
      },
      blocking_issues: [],
    });

    renderPage("/studies/11");

    expect(await screen.findByText(/geo submission helper/i)).toBeInTheDocument();
    expect(screen.getByText(/needs samples/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download geo csv/i })).toBeDisabled();
  });

  it("requires typed confirmation before deleting from the study workspace menu", async () => {
    renderPage("/studies/11");

    fireEvent.click(await screen.findByRole("button", { name: /more study actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /delete study/i }));

    expect(await screen.findByRole("dialog", { name: /delete study/i })).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: /^delete study$/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type the study title/i), {
      target: { value: "Hepatocyte mercury dose response" },
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteStudy).toHaveBeenCalled();
      expect(vi.mocked(deleteStudy).mock.calls.at(-1)?.[0]).toBe(11);
    });
  });
});
