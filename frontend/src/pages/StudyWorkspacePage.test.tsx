import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { StudyWorkspacePage } from "./StudyWorkspacePage";
import { deleteStudy } from "../api/studies";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

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
      metadata_columns: [],
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
      suggested_contrasts: [],
      selected_contrasts: [],
      updated_at: "2026-04-10T12:00:00Z",
      finalized_at: null,
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
          group: "control",
          dose: "0",
          chemical: "",
          chemical_longname: "",
          technical_control: false,
          reference_rna: false,
          solvent_control: false,
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
  };
});

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: {
      username: "mmeier",
      profile: { role: "admin" as const },
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
  it("defaults to the samples-first tab layout", async () => {
    renderPage("/studies/11");

    expect(await screen.findByRole("heading", { name: /hepatocyte mercury dose response/i })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /continue onboarding/i })).toHaveAttribute("href", "/studies/11/onboarding");
    expect(screen.getByRole("tab", { name: /samples/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /contrasts/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /collaboration info/i })).toBeInTheDocument();

    const samplesTab = screen.getByRole("tab", { name: /samples/i });
    expect(samplesTab).toHaveAttribute("aria-selected", "true");

    expect(await screen.findByText(/sample explorer/i)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /sample id/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /sample name/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /group/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /dose/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /controls/i })).toBeInTheDocument();
    expect(screen.getByText(/showing 1-1 of 1/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /selected sample/i })).toBeInTheDocument();
    expect(screen.getAllByText("S-001")).toHaveLength(2);
    expect(screen.getByText(/group: control/i)).toBeInTheDocument();
    expect(screen.getByText(/dose: 0/i)).toBeInTheDocument();
    expect(screen.getByText(/chemical: none/i)).toBeInTheDocument();
    expect(screen.getByText(/long chemical name/i)).toBeInTheDocument();
    expect(screen.getByText(/no assays yet for this sample/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/platform/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/genome version/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/quantification method/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add assay/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add samples/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add contrasts/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more study actions/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /onboarding wizard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /metadata onboarding/i })).not.toBeInTheDocument();
  });

  it("syncs the selected tab with the route search params", async () => {
    renderPage("/studies/11?tab=contrasts");

    const contrastsTab = await screen.findByRole("tab", { name: /contrasts/i });
    expect(contrastsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/contrasts for this study/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /collaboration info/i }));
    expect(await screen.findByText(/collaboration context/i)).toBeInTheDocument();
  });

  it("opens the intake tools from add samples and switches tabs from add contrasts", async () => {
    renderPage("/studies/11");

    fireEvent.click(await screen.findByRole("button", { name: /add samples/i }));
    expect(await screen.findByText(/sample metadata onboarding/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add contrasts/i }));
    expect(await screen.findByText(/contrasts for this study/i)).toBeInTheDocument();
  });

  it("surfaces lower-frequency study actions in a local overflow menu", async () => {
    renderPage("/studies/11");

    fireEvent.click(await screen.findByRole("button", { name: /more study actions/i }));

    expect(await screen.findByRole("menuitem", { name: /open collaboration/i })).toHaveAttribute(
      "href",
      "/collaborations/7",
    );
    expect(screen.getByRole("menuitem", { name: /download config bundle/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /delete study/i })).toBeInTheDocument();
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
