import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { AdminStudyImportPage } from "./AdminStudyImportPage";

const fetchProjectsMock = vi.fn();
const fetchLookupsMock = vi.fn();
const createStudyImportMock = vi.fn();
const fetchStudyImportMock = vi.fn();
const previewMetadataMock = vi.fn();
const previewContrastsMock = vi.fn();
const registerCountResourceMock = vi.fn();
const commitStudyImportMock = vi.fn();

vi.mock("../api/projects", async () => {
  const actual = await vi.importActual<typeof import("../api/projects")>("../api/projects");
  return {
    ...actual,
    fetchProjects: (...args: unknown[]) => fetchProjectsMock(...args),
  };
});

vi.mock("../api/lookups", async () => {
  const actual = await vi.importActual<typeof import("../api/lookups")>("../api/lookups");
  return {
    ...actual,
    fetchLookups: (...args: unknown[]) => fetchLookupsMock(...args),
  };
});

vi.mock("../api/studyImports", async () => {
  const actual = await vi.importActual<typeof import("../api/studyImports")>("../api/studyImports");
  return {
    ...actual,
    createStudyImport: (...args: unknown[]) => createStudyImportMock(...args),
    fetchStudyImport: (...args: unknown[]) => fetchStudyImportMock(...args),
    previewStudyImportMetadata: (...args: unknown[]) => previewMetadataMock(...args),
    previewStudyImportContrasts: (...args: unknown[]) => previewContrastsMock(...args),
    registerStudyImportCountResource: (...args: unknown[]) => registerCountResourceMock(...args),
    commitStudyImport: (...args: unknown[]) => commitStudyImportMock(...args),
  };
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AdminStudyImportPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("AdminStudyImportPage", () => {
  beforeEach(() => {
    fetchProjectsMock.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 7,
          title: "Project Alpha",
          description: "",
          owner: null,
          owner_id: null,
          pi_name: "PI",
          researcher_name: "Researcher",
          bioinformatician_assigned: "Bioinfo",
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
    });
    fetchLookupsMock.mockResolvedValue({
      version: 2,
      metadata_field_definitions: [],
      lookups: {
        soft: {
          pi_name: { policy: "scoped_select_or_create", values: [] },
          researcher_name: { policy: "scoped_select_or_create", values: [] },
          celltype: { policy: "scoped_select_or_create", values: [] },
          sequenced_by: { policy: "scoped_select_or_create", values: [] },
        },
        controlled: {},
      },
      profiling_platforms: [
        {
          id: 3,
          platform_name: "tgx-rnaseq-v1",
          title: "TGx RNA-Seq",
          description: "",
          version: "",
          technology_type: "RNA-Seq",
          study_type: "TGx",
          species: "human",
          species_label: "Human",
          url: "",
          ext: {},
          study_count: 0,
        },
      ],
    });
    createStudyImportMock.mockResolvedValue({
      id: 12,
      status: "planned",
      project_id: 7,
      title: "Curated Mercury Study",
      study_name: "UL-2026-001",
      study_type: "TGx",
      platform_id: 3,
      metadata_preview: { valid: false, issues: [], normalized_rows: [] },
      contrasts_preview: { valid: false, issues: [], contrasts: [] },
      count_resource: null,
    });
    fetchStudyImportMock.mockResolvedValue({
      id: 12,
      status: "planned",
      project_id: 7,
      title: "Curated Mercury Study",
      study_name: "UL-2026-001",
      study_type: "TGx",
      platform_id: 3,
      metadata_preview: { valid: false, issues: [], normalized_rows: [] },
      contrasts_preview: { valid: false, issues: [], contrasts: [] },
      count_resource: null,
    });
    previewMetadataMock.mockResolvedValue({
      valid: true,
      issues: [],
      normalized_rows: [{ sample_ID: "ctrl_1", group: "control" }],
      columns: ["sample_ID", "group"],
    });
    previewContrastsMock.mockResolvedValue({
      valid: true,
      issues: [],
      contrasts: [{ reference_group: "control", comparison_group: "treated" }],
    });
    registerCountResourceMock.mockResolvedValue({
      resource: {
        display_name: "counts.tsv",
        file_format: "tsv",
        checksum: "abc123",
      },
    });
    commitStudyImportMock.mockResolvedValue({
      study_id: 99,
      study_title: "Curated Mercury Study",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a draft import and keeps commit disabled until metadata and contrasts validate", async () => {
    renderPage();

    await screen.findByText("New study import");
    await screen.findByRole("option", { name: "Project Alpha" });
    await screen.findByRole("option", { name: "tgx-rnaseq-v1" });

    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Study title"), { target: { value: "Curated Mercury Study" } });
    fireEvent.change(screen.getByLabelText("Warehouse study name"), { target: { value: "UL-2026-001" } });
    fireEvent.change(screen.getByLabelText("Cell type"), { target: { value: "Hepatocyte" } });
    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "3" } });

    fireEvent.click(screen.getByRole("button", { name: "Create draft import" }));

    await waitFor(() => {
      expect(createStudyImportMock).toHaveBeenCalled();
      expect(createStudyImportMock.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          project_id: 7,
          title: "Curated Mercury Study",
        }),
      );
    });

    const commitButton = await screen.findByRole("button", { name: "Commit import" });
    expect(commitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Metadata file content"), {
      target: { value: "sample_ID\tgroup\nctrl_1\tcontrol\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview metadata" }));

    await waitFor(() => expect(previewMetadataMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Contrasts file content"), {
      target: { value: "reference_group\tcomparison_group\ncontrol\ttreated\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview contrasts" }));

    await waitFor(() => expect(previewContrastsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(commitButton).toBeEnabled());

    fireEvent.change(screen.getByLabelText("Count file path"), {
      target: { value: "/data/studies/UL-2026-001/counts.tsv.gz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register count resource" }));
    await waitFor(() =>
      expect(registerCountResourceMock.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({
          path: "/data/studies/UL-2026-001/counts.tsv.gz",
        }),
      ),
    );
    expect(registerCountResourceMock.mock.calls[0]?.[1]).not.toHaveProperty("content");
  });
});
