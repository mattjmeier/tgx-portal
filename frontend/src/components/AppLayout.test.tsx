import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { AppLayout } from "./AppLayout";

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      username: "mmeier",
      profile: {
        role: "admin",
      },
    },
    logout: vi.fn(),
  }),
}));

vi.mock("../api/projects", () => ({
  fetchProjects: vi.fn(async () => ({
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 7,
        title: "Mercury tox study",
        pi_name: "Dr. Stone",
        owner: "client",
        owner_id: 3,
        researcher_name: "Kim",
        bioinformatician_assigned: "A. Chen",
        description: "A project description",
        created_at: "2026-04-08T00:00:00Z",
      },
      {
        id: 8,
        title: "Cadmium follow-up",
        pi_name: "Dr. Li",
        owner: "client",
        owner_id: 5,
        researcher_name: "Alex",
        bioinformatician_assigned: "J. Singh",
        description: "Another project description",
        created_at: "2026-04-08T00:00:00Z",
      },
    ],
  })),
  fetchProject: vi.fn(async (projectId: number) => ({
    id: projectId,
    title: projectId === 7 ? "Mercury tox study" : "Cadmium follow-up",
    pi_name: projectId === 7 ? "Dr. Stone" : "Dr. Li",
    owner: "client",
    owner_id: projectId === 7 ? 3 : 5,
    researcher_name: projectId === 7 ? "Kim" : "Alex",
    bioinformatician_assigned: projectId === 7 ? "A. Chen" : "J. Singh",
    description: "A project description",
    created_at: "2026-04-08T00:00:00Z",
  })),
  downloadProjectConfig: vi.fn(async () => new Blob(["config"])),
}));

vi.mock("../api/studies", () => ({
  fetchStudies: vi.fn(async (projectId: number) => ({
    count: projectId === 7 ? 2 : 1,
    next: null,
    previous: null,
    results:
      projectId === 7
        ? [
            {
              id: 11,
              project: 7,
              species: "human",
              celltype: "hepatocyte",
              treatment_var: "mercury",
              batch_var: "batch-1",
            },
            {
              id: 12,
              project: 7,
              species: "rat",
              celltype: "kidney",
              treatment_var: "cadmium",
              batch_var: "batch-2",
            },
          ]
        : [
            {
              id: 21,
              project: 8,
              species: "mouse",
              celltype: "cortex",
              treatment_var: "lead",
              batch_var: "batch-3",
            },
          ],
  })),
}));

function renderLayout(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/collaborations" element={<div>Collaborations page</div>} />
            <Route path="/collaborations/new" element={<div>New collaboration page</div>} />
            <Route path="/library" element={<div>Reference library page</div>} />
            <Route path="/collaborations/:projectId" element={<div>Workspace page</div>} />
            <Route path="/collaborations/:projectId/studies/new" element={<div>Study create page</div>} />
            <Route path="/studies/new" element={<div>Global study page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppLayout", () => {
  it("shows create and browse sections with collaboration-first labels", () => {
    renderLayout("/collaborations");

    expect(screen.getByRole("navigation", { name: /application/i })).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new collaboration/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^new study$/i })).toBeInTheDocument();
    expect(screen.getByText("Browse")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /collaborations/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /studies/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reference library/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin/i })).toBeInTheDocument();
    expect(screen.getByText(/open a collaboration workspace to see studies/i)).toBeInTheDocument();
  });

  it("lets users expand collaborations separately from studies in browse mode", async () => {
    renderLayout("/collaborations");

    fireEvent.click(screen.getByRole("button", { name: /collaborations/i }));

    expect(await screen.findByRole("link", { name: /collaboration registry/i })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /mercury tox study/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cadmium follow-up/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /studies/i }));

    expect(await screen.findByText(/open a collaboration to browse studies/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /human hepatocyte/i })).not.toBeInTheDocument();
  });

  it("shows studies as a separate browse branch inside an active collaboration", async () => {
    renderLayout("/collaborations/7?study=11");

    fireEvent.click(screen.getByRole("button", { name: /studies/i }));

    expect(await screen.findByRole("link", { name: /study directory/i })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /human hepatocyte/i })).toBeInTheDocument();
  });

  it("keeps active collaboration navigation out of the new collaboration route", () => {
    renderLayout("/collaborations/new");

    expect(screen.getByText("New collaboration page")).toBeInTheDocument();
    expect(screen.queryByText(/active collaboration/i)).not.toBeInTheDocument();
    expect(screen.getByText(/open a collaboration workspace to see studies/i)).toBeInTheDocument();
  });

  it("navigates to the global study creation flow from the sidebar", () => {
    renderLayout("/collaborations");

    fireEvent.click(screen.getByRole("link", { name: /^new study$/i }));

    expect(screen.getByText("Global study page")).toBeInTheDocument();
    expect(screen.getByText(/add a study/i)).toBeInTheDocument();
  });

  it("reveals active collaboration and study actions in workspace routes", async () => {
    renderLayout("/collaborations/7?study=11");

    expect((await screen.findAllByText(/mercury tox study/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/manage studies, samples, and configuration outputs\./i)).toBeInTheDocument();
    expect(screen.getByText("Active collaboration")).toBeInTheDocument();
    expect(screen.queryByText(/current collaboration/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /studies/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add study/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /download config bundle/i })).toBeInTheDocument();
    expect(screen.getByText("Active study")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sample intake/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sample explorer/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sample details/i })).toBeInTheDocument();
  });

  it("passes the active collaboration into the global study create link", async () => {
    renderLayout("/collaborations/7");

    const newStudyLink = await screen.findByRole("link", { name: /^new study$/i });
    expect(newStudyLink).toHaveAttribute("href", "/studies/new?collaboration=7");
  });
});
