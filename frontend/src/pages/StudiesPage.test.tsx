import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { StudiesPage } from "./StudiesPage";

vi.mock("../api/studies", () => ({
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
      <MemoryRouter initialEntries={["/studies"]}>
        <Routes>
          <Route path="/studies" element={<StudiesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudiesPage", () => {
  it("groups studies by collaboration and shows the study title first", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: /studies/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /mercury tox study/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /cadmium follow-up/i })).toBeInTheDocument();

    expect(await screen.findByRole("link", { name: /hepatocyte mercury dose response/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /kidney cadmium follow-up/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mouse cortex lead pilot/i })).toBeInTheDocument();

    expect(screen.getByText(/human\s*·\s*hepatocyte/i)).toBeInTheDocument();
  });
});
