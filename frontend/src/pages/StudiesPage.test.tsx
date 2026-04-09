import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { StudiesPage } from "./StudiesPage";

vi.mock("../api/studies", async () => {
  const actual = await vi.importActual<typeof import("../api/studies")>("../api/studies");
  return {
    ...actual,
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
          sample_count: 2,
          assay_count: 4,
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
          sample_count: 1,
          assay_count: 2,
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
          sample_count: 3,
          assay_count: 5,
        },
      ],
    })),
    deleteStudy: vi.fn(async () => undefined),
  };
});

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
    expect(await screen.findByRole("link", { name: /mercury tox study/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^cadmium follow-up$/i })).toBeInTheDocument();

    expect(await screen.findByRole("link", { name: /^hepatocyte mercury dose response$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^kidney cadmium follow-up$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^mouse cortex lead pilot$/i })).toBeInTheDocument();

    expect(screen.getByText(/human\s*·\s*hepatocyte/i)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /samples/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /assays/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^open$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open collaboration/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^mercury tox study$/i })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /^cadmium follow-up$/i })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /edit study/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /delete study/i }).length).toBeGreaterThan(0);
  });
});
