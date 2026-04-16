import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { deleteProject, fetchProjects } from "../api/projects";
import { ProjectsPage } from "./ProjectsPage";

vi.mock("../api/projects", () => ({
  fetchProjects: vi.fn(),
  deleteProject: vi.fn(),
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
  it("supports server-side browsing, search, sorting, and pagination", async () => {
    vi.mocked(fetchProjects).mockImplementation(
      async (options?: { page?: number; pageSize?: number; ordering?: string; search?: string }) => {
        const page = options?.page ?? 1;

        if (page === 2) {
          return {
            count: 25,
            next: null,
            previous: "http://example.com/api/projects/?page=1",
            results: [
              {
                id: 21,
                title: "Page 2 collaboration",
                pi_name: "Dr. Page",
                owner: "client",
                owner_id: 3,
                researcher_name: "Kim",
                bioinformatician_assigned: "A. Chen",
                description: "A project description",
                created_at: "2026-04-08T00:00:00Z",
              },
            ],
          };
        }

        return {
          count: 25,
          next: "http://example.com/api/projects/?page=2",
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
        };
      },
    );

    renderPage();

    const heading = await screen.findByRole("heading", { name: /collaborations/i });

    expect(heading).toBeInTheDocument();
    expect(heading.closest(".bg-card")).not.toBeNull();
    expect(screen.getByRole("link", { name: /new collaboration/i })).toBeInTheDocument();
    expect(fetchProjects).toHaveBeenCalled();

    const searchInput = screen.getByRole("textbox", { name: /search/i });
    fireEvent.change(searchInput, { target: { value: "cadmium" } });
    await waitFor(() => {
      expect(fetchProjects).toHaveBeenLastCalledWith(expect.objectContaining({ search: "cadmium" }));
    });

    fireEvent.click(screen.getByRole("button", { name: /^pi$/i }));
    await waitFor(() => {
      expect(fetchProjects).toHaveBeenLastCalledWith(expect.objectContaining({ ordering: "pi_name" }));
    });

    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(await screen.findByText(/page 2 collaboration/i)).toBeInTheDocument();
  });

  it("wraps long collaboration descriptions within a constrained width", async () => {
    const longDescription =
      "This is a deliberately long study description that should wrap in the collaboration cell instead of stretching the entire table beyond the available page width.";

    vi.mocked(fetchProjects).mockResolvedValueOnce({
      count: 1,
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
          description: longDescription,
          created_at: "2026-04-08T00:00:00Z",
        },
      ],
    });

    renderPage();

    const description = await screen.findByText(longDescription);

    expect(description).toHaveClass("max-w-xl");
    expect(description).toHaveClass("whitespace-normal");
    expect(description).toHaveClass("break-words");
    expect(description).not.toHaveClass("truncate");
  });

  it("deletes a collaboration after typed confirmation", async () => {
    const deletedProjectIds = new Set<number>();

    vi.mocked(fetchProjects).mockImplementation(async () => ({
      count: 2 - deletedProjectIds.size,
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
      ].filter((project) => !deletedProjectIds.has(project.id)),
    }));

    vi.mocked(deleteProject).mockImplementation(async (projectId: number) => {
      deletedProjectIds.add(projectId);
    });

    renderPage();

    expect(await screen.findByText("Mercury tox study")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /delete collaboration mercury tox study/i }));
    expect(await screen.findByRole("heading", { name: /delete collaboration/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/type the collaboration title/i), {
      target: { value: "Mercury tox study" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^delete collaboration$/i }));

    await waitFor(() => {
      expect(vi.mocked(deleteProject).mock.calls[0]?.[0]).toBe(7);
    });
    await waitFor(() => {
      expect(screen.queryByText("Mercury tox study")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Cadmium follow-up")).toBeInTheDocument();
  });
});
