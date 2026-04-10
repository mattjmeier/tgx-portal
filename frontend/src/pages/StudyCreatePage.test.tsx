import { render, screen } from "@testing-library/react";
import { within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { StudyCreatePage } from "./StudyCreatePage";

vi.mock("../api/projects", () => ({
  fetchProject: vi.fn(async (projectId: number) => ({
    id: projectId,
    title: projectId === 7 ? "Mercury tox study" : "Cadmium follow-up",
    pi_name: "Dr. Stone",
    owner: "client",
    owner_id: 3,
    researcher_name: "Kim",
    bioinformatician_assigned: "A. Chen",
    description: "A project description",
    created_at: "2026-04-08T00:00:00Z",
  })),
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
        pi_name: "Dr. Stone",
        owner: "client",
        owner_id: 3,
        researcher_name: "Kim",
        bioinformatician_assigned: "A. Chen",
        description: "A project description",
        created_at: "2026-04-08T00:00:00Z",
      },
    ],
  })),
}));

vi.mock("../api/studies", () => ({
  createStudy: vi.fn(),
}));

function renderPage(initialEntry: string) {
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
          <Route path="/studies/new" element={<StudyCreatePage />} />
          <Route path="/collaborations/:projectId/studies/new" element={<StudyCreatePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudyCreatePage", () => {
  it("requires a collaboration selection for the global study flow", async () => {
    renderPage("/studies/new");

    expect(await screen.findByRole("combobox", { name: /collaboration/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /choose a collaboration first/i })).toBeInTheDocument();
    expect(screen.getByText(/new study onboarding/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /back to collaborations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /species/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /study title/i })).not.toBeInTheDocument();
  });

  it("renders the onboarding entry step immediately when opened from an active collaboration", async () => {
    renderPage("/collaborations/7/studies/new");

    expect(await screen.findByText(/enter the onboarding wizard/i)).toBeInTheDocument();
    expect(screen.getByText(/title is the only field needed here/i)).toBeInTheDocument();
    expect(screen.getByText(/you are starting a study under/i)).toBeInTheDocument();
    expect(screen.getByText(/mercury tox study/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /back to collaboration/i })).not.toBeInTheDocument();
    const definitionsHeading = screen.getByRole("heading", { name: /definitions/i });
    const definitionsCard = definitionsHeading.closest(".rounded-xl");
    expect(definitionsCard).not.toBeNull();
    const definitions = within(definitionsCard as HTMLElement);
    expect(definitions.getByText(/^collaboration$/i)).toBeInTheDocument();
    expect(definitions.getByText(/^study$/i)).toBeInTheDocument();
    expect(definitions.queryByText(/^species$/i)).not.toBeInTheDocument();
    expect(definitions.queryByText(/^cell type$/i)).not.toBeInTheDocument();
    expect(definitions.queryByText(/^treatment variable$/i)).not.toBeInTheDocument();
    expect(definitions.queryByText(/^batch variable$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /collaboration/i })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /study title/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start onboarding/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /species/i })).not.toBeInTheDocument();
  });

  it("reveals the study form when the global flow receives a selected collaboration", async () => {
    renderPage("/studies/new?collaboration=7");

    expect(await screen.findByRole("textbox", { name: /study title/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /study title/i })).toBeInTheDocument();
    expect(screen.getByText(/you are starting a study under/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /back to collaborations/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /definitions/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /species/i })).not.toBeInTheDocument();
  });
});
