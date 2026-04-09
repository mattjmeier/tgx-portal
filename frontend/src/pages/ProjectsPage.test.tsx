import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { fetchProjects } from "../api/projects";
import { ProjectsPage } from "./ProjectsPage";

vi.mock("../api/projects", () => ({
  fetchProjects: vi.fn(),
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

    expect(await screen.findByRole("heading", { name: /collaborations/i })).toBeInTheDocument();
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
});
