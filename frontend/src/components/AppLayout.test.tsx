import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, vi } from "vitest";

import { fetchProjects } from "../api/projects";
import { deleteStudy, fetchStudiesIndex } from "../api/studies";
import { AppLayout } from "./AppLayout";

const deletedStudyIds = new Set<number>();

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

vi.mock("../api/studies", async () => {
  const actual = await vi.importActual<typeof import("../api/studies")>("../api/studies");

  return {
    ...actual,
    fetchStudy: vi.fn(async (studyId: number) => ({
      id: studyId,
      project: studyId === 21 ? 8 : 7,
      project_title: studyId === 21 ? "Cadmium follow-up" : "Mercury tox study",
      title:
        studyId === 12
          ? "Kidney cadmium follow-up"
          : studyId === 21
            ? "Mouse cortex lead pilot"
            : "Hepatocyte mercury dose response",
      species: studyId === 21 ? "mouse" : studyId === 12 ? "rat" : "human",
      celltype: studyId === 21 ? "cortex" : studyId === 12 ? "kidney" : "hepatocyte",
      treatment_var: studyId === 21 ? "lead" : studyId === 12 ? "cadmium" : "mercury",
      batch_var: studyId === 21 ? "batch-3" : studyId === 12 ? "batch-2" : "batch-1",
      status: studyId === 11 ? "draft" : "active",
    })),
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
          status: "draft",
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
          status: "active",
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
          status: "active",
        },
      ].filter((study) => !deletedStudyIds.has(study.id)),
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
                status: "draft",
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
                status: "active",
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
                status: "active",
              },
            ],
    })),
    deleteStudy: vi.fn(async (studyId: number) => {
      deletedStudyIds.add(studyId);
    }),
  };
});

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
            <Route path="/" element={<div>Home overview page</div>} />
            <Route path="/collaborations" element={<div>Collaborations page</div>} />
            <Route path="/studies" element={<div>Studies page</div>} />
            <Route path="/collaborations/new" element={<div>New collaboration page</div>} />
            <Route path="/library" element={<div>Reference library page</div>} />
            <Route path="/collaborations/:projectId" element={<div>Workspace page</div>} />
            <Route path="/collaborations/:projectId/studies/new" element={<div>Study create page</div>} />
            <Route path="/studies/new" element={<div>Global study page</div>} />
            <Route path="/studies/:studyId" element={<div>Study workspace page</div>} />
            <Route path="/studies/:studyId/onboarding" element={<div>Study onboarding page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppLayout", () => {
  beforeEach(() => {
    localStorage.clear();
    deletedStudyIds.clear();

    vi.mocked(fetchStudiesIndex).mockImplementation(async () => ({
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
          status: "draft",
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
          status: "active",
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
          status: "active",
        },
      ].filter((study) => !deletedStudyIds.has(study.id)),
    }));
  });

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
    expect(screen.queryByText(/active collaboration/i)).not.toBeInTheDocument();
  });

  it("shows a home-shell header for the workspace overview route", () => {
    renderLayout("/");

    expect(screen.getByText("Portal overview")).toBeInTheDocument();
    expect(
      screen.getByText("Start from the portal home, then jump into collaborations, studies, or shared reference data."),
    ).toBeInTheDocument();
    expect(screen.getByText("Home overview page")).toBeInTheDocument();
  });

  it("shows reference and admin actions in a bottom utilities section above signed-in details", () => {
    renderLayout("/collaborations");

    const utilitiesLabel = screen.getByText("Utilities");
    const footer = utilitiesLabel.closest("footer");

    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByRole("link", { name: /reference library/i })).toBeInTheDocument();
    expect(within(footer as HTMLElement).getByRole("link", { name: /^admin$/i })).toBeInTheDocument();
    expect(within(footer as HTMLElement).getByText(/signed in/i)).toBeInTheDocument();
  });

  it("shows an inline draft shelf outside the wizard for a single unfinished study", async () => {
    renderLayout("/collaborations");

    expect(await screen.findByText(/draft study in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/hepatocyte mercury dose response/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue designing hepatocyte mercury dose response/i })).toHaveAttribute(
      "href",
      "/studies/11/onboarding",
    );
  });

  it("shows multiple unfinished studies instead of collapsing to only the newest draft", async () => {
    vi.mocked(fetchStudiesIndex).mockResolvedValueOnce({
      count: 4,
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
          status: "draft",
        },
        {
          id: 13,
          project: 7,
          project_title: "Mercury tox study",
          title: "Liver recovery pilot",
          species: "mouse",
          celltype: "liver",
          treatment_var: "mercury",
          batch_var: "batch-4",
          status: "draft",
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
          status: "active",
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
          status: "active",
        },
      ],
    });

    renderLayout("/collaborations");

    expect(await screen.findByText(/2 draft studies in progress/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue designing liver recovery pilot/i })).toHaveAttribute(
      "href",
      "/studies/13/onboarding",
    );
    expect(screen.getByRole("link", { name: /continue designing hepatocyte mercury dose response/i })).toHaveAttribute(
      "href",
      "/studies/11/onboarding",
    );
    expect(screen.getByRole("link", { name: /view all studies/i })).toHaveAttribute("href", "/studies");
  });

  it("hides the inline draft shelf while viewing the onboarding wizard itself", async () => {
    renderLayout("/studies/11/onboarding");

    expect(await screen.findByText("Study onboarding page")).toBeInTheDocument();
    expect(screen.queryByText(/draft study in progress/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/draft studies in progress/i)).not.toBeInTheDocument();
  });

  it("removes the draft shelf after deleting the unfinished study", async () => {
    renderLayout("/studies/11");

    expect(await screen.findByRole("link", { name: /continue designing hepatocyte mercury dose response/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /study actions for hepatocyte mercury dose response/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /delete study/i }));
    expect(await screen.findByRole("dialog", { name: /delete study/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/type the study title/i), {
      target: { value: "Hepatocyte mercury dose response" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^delete study$/i }));

    expect(await screen.findByText("Studies page")).toBeInTheDocument();
    expect(vi.mocked(deleteStudy).mock.calls.at(-1)?.[0]).toBe(11);
    expect(screen.queryByText(/draft study in progress/i)).not.toBeInTheDocument();
  });

  it("lets users expand collaborations separately from studies in browse mode", async () => {
    renderLayout("/collaborations");
    const navigation = screen.getByRole("navigation", { name: /application/i });

    fireEvent.click(screen.getByRole("button", { name: /toggle collaborations/i }));

    expect(await within(navigation).findByText(/mercury tox study/i)).toBeInTheDocument();
    expect(within(navigation).getByText(/cadmium follow-up/i)).toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: /collaboration registry/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle studies/i }));

    expect(await within(navigation).findByRole("link", { name: /hepatocyte mercury dose response/i })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: /mouse cortex lead pilot/i })).toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: /study directory/i })).not.toBeInTheDocument();
  });

  it("keeps browse navigation on the links while expand buttons only reveal previews", async () => {
    renderLayout("/collaborations/7?study=11");
    const navigation = screen.getByRole("navigation", { name: /application/i });

    expect((await within(navigation).findAllByRole("link", { name: /hepatocyte mercury dose response/i })).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("link", { name: /^studies$/i }));

    expect(await screen.findByText("Studies page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle studies/i }));
    expect(within(navigation).queryByRole("link", { name: /hepatocyte mercury dose response/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle studies/i }));
    expect((await within(navigation).findAllByRole("link", { name: /hepatocyte mercury dose response/i })).length).toBeGreaterThan(0);
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
    const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(breadcrumb).getByRole("link", { name: /^collaborations$/i })).toHaveAttribute("href", "/collaborations");
    expect(screen.getByRole("heading", { name: /new collaboration/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /back to collaborations/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/active collaboration/i)).not.toBeInTheDocument();
  });

  it("shows studies breadcrumbs on the global study creation route", () => {
    renderLayout("/studies/new");

    expect(screen.getByText("Global study page")).toBeInTheDocument();
    const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(breadcrumb).getByRole("link", { name: /^studies$/i })).toHaveAttribute("href", "/studies");
    expect(screen.getByRole("heading", { name: /new study/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /back to studies/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/add a study/i)).not.toBeInTheDocument();
  });

  it("omits breadcrumbs on the studies index route", () => {
    renderLayout("/studies/");

    expect(screen.getByText("Studies page")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /breadcrumb/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/active collaboration/i)).not.toBeInTheDocument();
  });

  it("navigates to the global study creation flow from the sidebar", () => {
    renderLayout("/collaborations");

    fireEvent.click(screen.getByRole("link", { name: /^new study$/i }));

    expect(screen.getByText("Global study page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /new study/i })).toBeInTheDocument();
  });

  it("keeps study workspace routes oriented without duplicating study-local navigation in the sidebar", async () => {
    renderLayout("/collaborations/7?study=11");

    expect((await screen.findAllByText(/mercury tox study/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /back to collaborations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /mercury tox study/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/manage studies, samples, and configuration outputs\./i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more information about/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Active collaboration")).not.toBeInTheDocument();
    expect(screen.queryByText("Active study")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^studies$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /toggle studies/i })).toBeInTheDocument();
    expect((await screen.findAllByText(/hepatocyte mercury dose response/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /study actions for hepatocyte mercury dose response/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^samples$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^contrasts$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /collaboration info/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/add samples/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add contrasts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/metadata onboarding/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/study information/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/download config bundle/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /add study/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /overview/i })).not.toBeInTheDocument();
  });

  it("passes the active collaboration into the global study create link", async () => {
    renderLayout("/collaborations/7");

    const newStudyLink = await screen.findByRole("link", { name: /^new study$/i });
    expect(newStudyLink).toHaveAttribute("href", "/studies/new?collaboration=7");
  });

  it("relies on the studies breadcrumb for return navigation on study workspace routes", async () => {
    renderLayout("/studies/11");

    expect(await screen.findByText("Study workspace page")).toBeInTheDocument();
    const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(breadcrumb).getByRole("link", { name: /^studies$/i })).toHaveAttribute("href", "/studies");
    expect(screen.queryByRole("link", { name: /back to studies/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /back to collaborations/i })).not.toBeInTheDocument();
  });

  it("keeps the studies branch global even when a collaboration is active", async () => {
    renderLayout("/collaborations/7?study=11");

    expect(await screen.findByRole("link", { name: /mouse cortex lead pilot/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /kidney cadmium follow-up/i })).toBeInTheDocument();
  });
});
