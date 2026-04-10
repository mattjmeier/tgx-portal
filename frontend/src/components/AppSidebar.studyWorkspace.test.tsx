import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { fetchProjects } from "../api/projects";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider } from "./ui/sidebar";

vi.mock("../api/studies", async () => {
  const actual = await vi.importActual<typeof import("../api/studies")>("../api/studies");
  return {
    ...actual,
    fetchStudy: vi.fn(async (studyId: number) =>
      studyId === 12
        ? {
            id: 12,
            project: 7,
            project_title: "Mercury tox study",
            title: "Kidney cadmium follow-up",
            species: "rat",
            celltype: "kidney",
            treatment_var: "cadmium",
            batch_var: "batch-2",
          }
        : {
            id: 11,
            project: 7,
            project_title: "Mercury tox study",
            title: "Hepatocyte mercury dose response",
            species: "human",
            celltype: "hepatocyte",
            treatment_var: "mercury",
            batch_var: "batch-1",
          },
    ),
    fetchStudies: vi.fn(async () => ({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 11,
          project: 7,
          project_title: "Mercury tox study",
          title: "Hepatocyte mercury dose response",
          species: "human",
          celltype: "hepatocyte",
          treatment_var: "mercury",
          batch_var: "batch-1",
        },
        {
          id: 12,
          project: 7,
          project_title: "Mercury tox study",
          title: "Kidney cadmium follow-up",
          species: "rat",
          celltype: "kidney",
          treatment_var: "cadmium",
          batch_var: "batch-2",
        },
      ],
    })),
    fetchStudiesIndex: vi.fn(async () => ({
      count: 3,
      next: null,
      previous: null,
      results: [
        {
          id: 11,
          project: 7,
          project_title: "Mercury tox study",
          title: "Hepatocyte mercury dose response",
          species: "human",
          celltype: "hepatocyte",
          treatment_var: "mercury",
          batch_var: "batch-1",
        },
        {
          id: 12,
          project: 7,
          project_title: "Mercury tox study",
          title: "Kidney cadmium follow-up",
          species: "rat",
          celltype: "kidney",
          treatment_var: "cadmium",
          batch_var: "batch-2",
        },
        {
          id: 21,
          project: 8,
          project_title: "Cadmium follow-up",
          title: "Mouse cortex lead pilot",
          species: "mouse",
          celltype: "cortex",
          treatment_var: "lead",
          batch_var: "batch-3",
        },
      ],
    })),
  };
});

vi.mock("../api/projects", async () => {
  const actual = await vi.importActual<typeof import("../api/projects")>("../api/projects");
  return {
    ...actual,
    fetchProjects: vi.fn(async () => ({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 7,
          title: "Mercury tox study",
          pi_name: "Dr. Example",
          researcher_name: "Researcher Example",
          bioinformatician_assigned: "Bioinformatics Example",
          description: "",
          created_at: "2026-01-01T00:00:00Z",
          owner: null,
          owner_id: null,
        },
        {
          id: 8,
          title: "Cadmium follow-up",
          pi_name: "Dr. Example",
          researcher_name: "Researcher Example",
          bioinformatician_assigned: "Bioinformatics Example",
          description: "",
          created_at: "2026-01-02T00:00:00Z",
          owner: null,
          owner_id: null,
        },
      ],
    })),
    fetchProject: vi.fn(async () => ({
      id: 7,
      title: "Mercury tox study",
      pi_name: "Dr. Example",
      description: "",
      owner: null,
    })),
    downloadProjectConfig: vi.fn(async () => new Blob()),
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

function renderSidebar(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppSidebar (study workspace)", () => {
  afterEach(() => {
    vi.mocked(fetchProjects).mockReset();
    vi.mocked(fetchProjects).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 7,
          title: "Mercury tox study",
          pi_name: "Dr. Example",
          researcher_name: "Researcher Example",
          bioinformatician_assigned: "Bioinformatics Example",
          description: "",
          created_at: "2026-01-01T00:00:00Z",
          owner: null,
          owner_id: null,
        },
        {
          id: 8,
          title: "Cadmium follow-up",
          pi_name: "Dr. Example",
          researcher_name: "Researcher Example",
          bioinformatician_assigned: "Bioinformatics Example",
          description: "",
          created_at: "2026-01-02T00:00:00Z",
          owner: null,
          owner_id: null,
        },
      ],
    });
  });

  it("renders the portal logo image in the sidebar header", () => {
    renderSidebar("/studies/11");

    const logo = screen.getByRole("img", { name: /tgx portal logo/i });
    expect(logo).toHaveAttribute("src", "/sidebar-logo.png");
    expect(logo).toHaveClass("object-cover");
  });

  it("keeps the selected study visible in the sidebar without duplicating workspace tabs", async () => {
    renderSidebar("/studies/11");

    expect(await screen.findByText(/hepatocyte mercury dose response/i)).toBeInTheDocument();
    expect(screen.getByText(/hepatocyte mercury dose response/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /study actions for hepatocyte mercury dose response/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^samples$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^contrasts$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /collaboration info/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/add samples/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add contrasts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/metadata onboarding/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/download config bundle/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/study information/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/active study/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/active collaboration/i)).not.toBeInTheDocument();
  });

  it("keeps top-level study navigation separate from the expand toggle", async () => {
    renderSidebar("/studies/11");

    const studiesLink = screen.getByRole("link", { name: /^studies$/i });
    const toggleButton = screen.getByRole("button", { name: /toggle studies/i });

    expect(studiesLink).toHaveAttribute("href", "/studies");
    expect(await screen.findByText(/hepatocyte mercury dose response/i)).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(screen.queryByText(/hepatocyte mercury dose response/i)).not.toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(await screen.findByText(/hepatocyte mercury dose response/i)).toBeInTheDocument();
  });

  it("keeps sibling studies visible without expanding a second navigation layer", async () => {
    renderSidebar("/studies/11");

    expect((await screen.findByText(/hepatocyte mercury dose response/i)).closest("a")).not.toBeNull();
    expect(screen.getByText(/kidney cadmium follow-up/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^samples$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/hepatocyte mercury dose response/i)).toBeInTheDocument();
    expect(screen.getByText(/kidney cadmium follow-up/i)).toBeInTheDocument();
    expect(screen.getByText(/kidney cadmium follow-up/i)).toBeInTheDocument();
    expect(screen.getByText(/mouse cortex lead pilot/i)).toBeInTheDocument();
  });

  it("reveals compact study actions from a three-dots menu", async () => {
    renderSidebar("/studies/11");

    fireEvent.click(await screen.findByRole("button", { name: /study actions for hepatocyte mercury dose response/i }));

    expect(await screen.findByRole("menuitem", { name: /open collaboration/i })).toHaveAttribute("href", "/collaborations/7");
    expect(screen.getByRole("menuitem", { name: /download config bundle/i })).toBeInTheDocument();
  });

  it("shows studies from outside the active collaboration in the studies branch", async () => {
    renderSidebar("/studies/11");

    expect(await screen.findByText(/mouse cortex lead pilot/i)).toBeInTheDocument();
    expect(screen.getByText(/kidney cadmium follow-up/i)).toBeInTheDocument();
  });

  it("shows a collaboration error state instead of loading forever when previews fail", async () => {
    vi.mocked(fetchProjects).mockRejectedValueOnce(new Error("Timed out"));

    renderSidebar("/studies/11");

    expect(await screen.findByText(/collaborations unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading collaborations/i)).not.toBeInTheDocument();
  });
});
