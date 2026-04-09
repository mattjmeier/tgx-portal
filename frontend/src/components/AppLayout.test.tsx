import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { fetchProjects } from "../api/projects";
import { fetchStudiesIndex } from "../api/studies";
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
          ]
        : [
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
            <Route path="/studies" element={<div>Studies page</div>} />
            <Route path="/collaborations/new" element={<div>New collaboration page</div>} />
            <Route path="/library" element={<div>Reference library page</div>} />
            <Route path="/collaborations/:projectId" element={<div>Workspace page</div>} />
            <Route path="/collaborations/:projectId/studies/new" element={<div>Study create page</div>} />
            <Route path="/studies/new" element={<div>Global study page</div>} />
            <Route path="/studies/:studyId" element={<div>Study workspace page</div>} />
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
    expect(screen.getByRole("link", { name: /^collaborations$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /toggle collaborations/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^studies$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /toggle studies/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reference library/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin/i })).toBeInTheDocument();
    expect(screen.queryByText(/active collaboration/i)).not.toBeInTheDocument();
  });

  it("lets users expand collaborations separately from studies in browse mode", async () => {
    renderLayout("/collaborations");

    fireEvent.click(screen.getByRole("button", { name: /toggle collaborations/i }));

    expect(await screen.findByText(/mercury tox study/i)).toBeInTheDocument();
    expect(screen.getByText(/cadmium follow-up/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /collaboration registry/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle studies/i }));

    expect(await screen.findByText(/hepatocyte mercury dose response/i)).toBeInTheDocument();
    expect(screen.getByText(/mouse cortex lead pilot/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /study directory/i })).not.toBeInTheDocument();
  });

  it("keeps browse navigation on the links while expand buttons only reveal previews", async () => {
    renderLayout("/collaborations/7?study=11");

    expect((await screen.findAllByText(/hepatocyte mercury dose response/i)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("link", { name: /^studies$/i }));

    expect(await screen.findByText("Studies page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle studies/i }));
    expect(screen.queryByText(/hepatocyte mercury dose response/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle studies/i }));
    expect((await screen.findAllByText(/hepatocyte mercury dose response/i)).length).toBeGreaterThan(0);
  });

  it("supports a collapsed browse branch when clicked twice", async () => {
    renderLayout("/collaborations");

    const collaborationsButton = screen.getByRole("button", { name: /toggle collaborations/i });

    fireEvent.click(collaborationsButton);
    expect(await screen.findByText(/mercury tox study/i)).toBeInTheDocument();

    fireEvent.click(collaborationsButton);
    expect(screen.queryByText(/mercury tox study/i)).not.toBeInTheDocument();
  });

  it("shows a More... affordance when the preview is truncated", async () => {
    const truncatedPreview = {
      count: 7,
      next: "/api/projects/?page=2",
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
      ],
    };

    vi.mocked(fetchProjects).mockResolvedValueOnce(truncatedPreview);
    vi.mocked(fetchProjects).mockResolvedValueOnce(truncatedPreview);

    renderLayout("/collaborations");

    fireEvent.click(screen.getByRole("button", { name: /toggle collaborations/i }));

    expect(await screen.findByRole("link", { name: /more/i })).toHaveAttribute("href", "/collaborations");
  });

  it("shows a More... affordance for studies when the preview is truncated", async () => {
    const truncatedPreview = {
      count: 6,
      next: "/api/studies/?page=2",
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
      ],
    };

    vi.mocked(fetchStudiesIndex).mockResolvedValueOnce(truncatedPreview);
    vi.mocked(fetchStudiesIndex).mockResolvedValueOnce(truncatedPreview);

    renderLayout("/collaborations");

    fireEvent.click(screen.getByRole("button", { name: /toggle studies/i }));

    expect(await screen.findByRole("button", { name: /more/i })).toBeInTheDocument();
  });

  it("expands the studies list in place when the More... hint is clicked", async () => {
    const truncatedPreview = {
      count: 6,
      next: "/api/studies/?page=2",
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
      ],
    };
    const expandedPreview = {
      count: 6,
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
        {
          id: 22,
          project: 8,
          project_title: "Cadmium follow-up",
          title: "Rat liver recovery cohort",
          species: "rat",
          celltype: "liver",
          treatment_var: "cadmium",
          batch_var: "batch-4",
        },
        {
          id: 23,
          project: 9,
          project_title: "Arsenic pilot",
          title: "Mouse kidney arsenic pilot",
          species: "mouse",
          celltype: "kidney",
          treatment_var: "arsenic",
          batch_var: "batch-5",
        },
        {
          id: 24,
          project: 10,
          project_title: "Lead follow-up",
          title: "Human cortex lead validation",
          species: "human",
          celltype: "cortex",
          treatment_var: "lead",
          batch_var: "batch-6",
        },
      ],
    };

    const fetchStudiesIndexMock = vi.mocked(fetchStudiesIndex);
    fetchStudiesIndexMock.mockImplementation(async (options) =>
      options?.pageSize === 40
        ? expandedPreview
        : truncatedPreview,
    );

    renderLayout("/collaborations");

    fireEvent.click(screen.getByRole("button", { name: /toggle studies/i }));

    const moreButton = await screen.findByRole("button", { name: /more/i });
    expect(screen.queryByText(/human cortex lead validation/i)).not.toBeInTheDocument();

    fireEvent.click(moreButton);

    expect(await screen.findByText(/human cortex lead validation/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^studies$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more/i })).not.toBeInTheDocument();
    expect(fetchStudiesIndex).toHaveBeenLastCalledWith({ pageSize: 40 });

    fetchStudiesIndexMock.mockReset();
    fetchStudiesIndexMock.mockImplementation(async () => ({
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
    }));
  });

  it("keeps active collaboration navigation out of the new collaboration route", () => {
    renderLayout("/collaborations/new");

    expect(screen.getByText("New collaboration page")).toBeInTheDocument();
    expect(screen.queryByText(/active collaboration/i)).not.toBeInTheDocument();
  });

  it("navigates to the global study creation flow from the sidebar", () => {
    renderLayout("/collaborations");

    fireEvent.click(screen.getByRole("link", { name: /^new study$/i }));

    expect(screen.getByText("Global study page")).toBeInTheDocument();
    expect(screen.getByText(/add a study/i)).toBeInTheDocument();
  });

  it("reveals study actions beneath the selected study in workspace routes", async () => {
    renderLayout("/collaborations/7?study=11");

    expect((await screen.findAllByText(/mercury tox study/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /back to collaborations/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /mercury tox study/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/manage studies, samples, and configuration outputs\./i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more information about/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Active collaboration")).not.toBeInTheDocument();
    expect(screen.queryByText("Active study")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^studies$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /toggle studies/i })).toBeInTheDocument();
    expect((await screen.findAllByText(/hepatocyte mercury dose response/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /samples/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contrasts/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /collaboration info/i })).toBeInTheDocument();
    expect(screen.getByText(/metadata onboarding/i)).toBeInTheDocument();
    expect(screen.getByText(/study information/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /download config bundle/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /add study/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /overview/i })).not.toBeInTheDocument();
  });

  it("passes the active collaboration into the global study create link", async () => {
    renderLayout("/collaborations/7");

    const newStudyLink = await screen.findByRole("link", { name: /^new study$/i });
    expect(newStudyLink).toHaveAttribute("href", "/studies/new?collaboration=7");
  });

  it("shows the studies back action in header space for study workspace routes", async () => {
    renderLayout("/studies/11");

    expect(await screen.findByText("Study workspace page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to studies/i })).toHaveAttribute("href", "/studies");
    expect(screen.queryByRole("link", { name: /back to collaborations/i })).not.toBeInTheDocument();
  });

  it("keeps the studies branch global even when a collaboration is active", async () => {
    renderLayout("/collaborations/7?study=11");

    expect(await screen.findByText(/mouse cortex lead pilot/i)).toBeInTheDocument();
    expect(screen.getByText(/kidney cadmium follow-up/i)).toBeInTheDocument();
  });
});
