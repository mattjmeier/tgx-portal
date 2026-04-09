import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { StudyWorkspacePage } from "./StudyWorkspacePage";

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
    expect(screen.getByRole("tab", { name: /samples/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /contrasts/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /collaboration info/i })).toBeInTheDocument();

    const samplesTab = screen.getByRole("tab", { name: /samples/i });
    expect(samplesTab).toHaveAttribute("aria-selected", "true");

    expect(await screen.findByText(/sample explorer/i)).toBeInTheDocument();
  });

  it("syncs the selected tab with the route search params", async () => {
    renderPage("/studies/11?tab=contrasts");

    const contrastsTab = await screen.findByRole("tab", { name: /contrasts/i });
    expect(contrastsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/contrasts for this study/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /collaboration info/i }));
    expect(await screen.findByText(/collaboration context/i)).toBeInTheDocument();
  });
});

