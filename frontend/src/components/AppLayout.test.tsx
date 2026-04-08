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
  fetchProject: vi.fn(async () => ({
    id: 7,
    title: "Mercury tox study",
    pi_name: "Dr. Stone",
    owner: "client",
    owner_id: 3,
    researcher_name: "Kim",
    bioinformatician_assigned: "A. Chen",
    description: "A project description",
    created_at: "2026-04-08T00:00:00Z",
  })),
}));

vi.mock("../api/studies", () => ({
  fetchStudies: vi.fn(async () => ({
    count: 2,
    next: null,
    previous: null,
    results: [
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
            <Route path="/projects" element={<div>Projects page</div>} />
            <Route path="/projects/new" element={<div>New project page</div>} />
            <Route path="/library" element={<div>Reference library page</div>} />
            <Route path="/projects/:projectId" element={<div>Workspace page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppLayout", () => {
  it("uses a collapsible projects menu with nested route links", () => {
    renderLayout("/projects");

    const projectsGroup = screen.getByRole("button", { name: /projects/i });

    expect(screen.getByRole("navigation", { name: /application/i })).toBeInTheDocument();
    expect(projectsGroup).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /project registry/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new project intake/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reference library/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin/i })).toBeInTheDocument();
    expect(screen.getByText(/open a project workspace to see studies/i)).toBeInTheDocument();
  });

  it("keeps project intake routes out of workspace mode", () => {
    renderLayout("/projects/new");

    expect(screen.getByText("New project page")).toBeInTheDocument();
    expect(screen.queryByText(/workspace overview/i)).not.toBeInTheDocument();
    expect(screen.getByText(/open a project workspace to see studies/i)).toBeInTheDocument();
  });

  it("navigates to project intake when the sidebar link is clicked", () => {
    renderLayout("/projects");

    fireEvent.click(screen.getByRole("link", { name: /new project intake/i }));

    expect(screen.getByText("New project page")).toBeInTheDocument();
    expect(screen.getByText(/create a new project/i)).toBeInTheDocument();
  });

  it("reveals project hierarchy inside workspace menus and collapses sample actions", async () => {
    renderLayout("/projects/7?study=11");

    const workspaceGroup = await screen.findByRole("button", { name: /current workspace/i });
    const studiesToggle = await screen.findByRole("button", { name: /studies/i });

    expect(workspaceGroup).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/mercury tox study/i)).toBeInTheDocument();
    expect(studiesToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /workspace overview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /human hepatocyte/i })).toBeInTheDocument();

    const sampleActionsToggle = screen.getByRole("button", { name: /sample actions/i });
    expect(sampleActionsToggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(sampleActionsToggle);

    expect(sampleActionsToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /create or import samples/i })).not.toBeInTheDocument();
  });
});
