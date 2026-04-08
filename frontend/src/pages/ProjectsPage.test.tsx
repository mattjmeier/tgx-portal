import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { ProjectsPage } from "./ProjectsPage";

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
        description: "A second project description",
        created_at: "2026-04-08T00:00:00Z",
      },
    ],
  })),
  deleteProject: vi.fn(async () => undefined),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectsPage", () => {
  it("opens directly on the collaboration table with compact shortcuts", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: /collaboration catalog/i })).toBeInTheDocument();
    expect(screen.getByText(/browse current collaborations first/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new collaboration/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^new study$/i })).toBeInTheDocument();
    expect((await screen.findAllByRole("link", { name: /open workspace/i })).length).toBeGreaterThan(0);
    expect(screen.queryByText(/choose this when/i)).not.toBeInTheDocument();
  });
});
