import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";

import { createProject } from "../api/projects";
import { FlashBanner } from "./FlashBanner";
import { ProjectForm } from "./ProjectForm";

vi.mock("../api/projects", async () => {
  const actual = await vi.importActual<typeof import("../api/projects")>("../api/projects");
  return {
    ...actual,
    createProject: vi.fn(),
  };
});

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/collaborations/new"]}>
        <Routes>
          <Route
            element={
              <>
                <FlashBanner />
                <LocationDisplay />
                <Outlet />
              </>
            }
          >
            <Route path="/collaborations/new" element={<ProjectForm />} />
            <Route path="/collaborations/:projectId" element={<div>Workspace</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectForm", () => {
  it("redirects into the collaboration workspace after creation", async () => {
    vi.mocked(createProject).mockResolvedValueOnce({
      id: 42,
      owner: null,
      owner_id: null,
      pi_name: "Dr. Stone",
      researcher_name: "Kim",
      bioinformatician_assigned: "A. Chen",
      title: "Mercury tox study",
      description: "A project description",
      created_at: "2026-04-08T00:00:00Z",
    });

    renderForm();

    fireEvent.change(screen.getByRole("textbox", { name: /collaboration title/i }), { target: { value: "Mercury tox study" } });
    fireEvent.change(screen.getByRole("textbox", { name: /pi name/i }), { target: { value: "Dr. Stone" } });
    fireEvent.change(screen.getByRole("textbox", { name: /researcher name/i }), { target: { value: "Kim" } });
    fireEvent.change(screen.getByRole("textbox", { name: /bioinformatician assigned/i }), { target: { value: "A. Chen" } });
    fireEvent.change(screen.getByRole("textbox", { name: /description/i }), { target: { value: "A project description" } });
    fireEvent.click(screen.getByRole("button", { name: /create collaboration/i }));

    expect(await screen.findByText("Workspace")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/collaborations/42");
    expect(screen.getByText(/collaboration created/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add a study/i })).toHaveAttribute("href", "/collaborations/42/studies/new");
  });
});

