import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { deleteStudy } from "../api/studies";
import { ProjectWorkspace } from "./ProjectWorkspace";

vi.mock("../api/studies", async () => {
  const actual = await vi.importActual<typeof import("../api/studies")>("../api/studies");
  return {
    ...actual,
    fetchStudies: vi.fn(async () => ({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 11,
          project: 7,
          project_title: "Endocrine Resilience Screen",
          title: "MCF7 estrogen pulse",
          status: "draft",
          species: "human",
          celltype: "breast epithelial",
          treatment_var: "estrogen",
          batch_var: "batch-a",
          sample_count: 3,
          assay_count: 2,
        },
        {
          id: 12,
          project: 7,
          project_title: "Endocrine Resilience Screen",
          title: "MCF7 recovery window",
          status: "active",
          species: "human",
          celltype: "breast epithelial",
          treatment_var: "recovery",
          batch_var: "batch-b",
          sample_count: 4,
          assay_count: 1,
        },
      ],
    })),
    deleteStudy: vi.fn(async () => undefined),
  };
});

vi.mock("../api/projects", async () => {
  const actual = await vi.importActual<typeof import("../api/projects")>("../api/projects");
  return {
    ...actual,
    downloadProjectConfig: vi.fn(async () => new Blob(["config"])),
  };
});

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: {
      username: "mmeier",
      profile: { role: "admin" as const },
    },
  }),
}));

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectWorkspace
          initialProjectId={7}
          projects={[
            {
              id: 7,
              title: "Endocrine Resilience Screen",
              pi_name: "Dr. Priya Shah",
              description:
                "Mock collaboration for study browsing and role-based review, focused on endocrine-active compound screening across human breast-cell models.",
              owner: "admin",
            },
          ]}
          showProjectSelector={false}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectWorkspace", () => {
  it("renders a compact collaboration summary with metrics and actions", async () => {
    renderWorkspace();

    expect(await screen.findByRole("heading", { name: /endocrine resilience screen/i })).toBeInTheDocument();
    expect(await screen.findByText(/mcf7 estrogen pulse/i)).toBeInTheDocument();
    expect(screen.queryByText(/^workspace$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/collaboration record/i)).toBeInTheDocument();
    expect(screen.getByText(/dr\. priya shah/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^2$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^7$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^3$/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/samples in collaboration/i)).toBeInTheDocument();
    expect(screen.getByText(/assay setup rows/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add study/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /new study/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download config bundle/i })).not.toBeInTheDocument();
  });

  it("shows studies in a table layout consistent with the studies directory", async () => {
    renderWorkspace();

    expect(await screen.findByRole("columnheader", { name: /study/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /samples/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /assay setup/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /actions/i })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /^mcf7 estrogen pulse$/i })).toHaveAttribute("href", "/studies/11");
    expect(screen.getAllByText(/breast epithelial/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^4$/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^open$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open collaboration/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^collaboration$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue onboarding for study mcf7 estrogen pulse/i })).toHaveAttribute(
      "href",
      "/studies/11/onboarding",
    );
    expect(screen.getByRole("link", { name: /review onboarding for study mcf7 recovery window/i })).toHaveAttribute(
      "href",
      "/studies/12/onboarding",
    );
    expect(screen.getAllByRole("button", { name: /delete study/i }).length).toBeGreaterThan(0);
  });

  it("does not show explanatory tooltip affordances in the streamlined layout", async () => {
    renderWorkspace();

    await screen.findByRole("heading", { name: /endocrine resilience screen/i });

    expect(screen.queryByRole("button", { name: /what is this collaboration workspace\?/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /when should i add a study\?/i })).not.toBeInTheDocument();
  });

  it("requires typing the study title before deleting from project workspace", async () => {
    renderWorkspace();

    fireEvent.click(await screen.findByRole("button", { name: /delete study mcf7 estrogen pulse/i }));
    expect(await screen.findByRole("dialog", { name: /delete study/i })).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: /^delete study$/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type the study title/i), {
      target: { value: "MCF7 estrogen pulse" },
    });

    fireEvent.click(confirmButton);
    await waitFor(() => {
      expect(deleteStudy).toHaveBeenCalled();
      expect(vi.mocked(deleteStudy).mock.calls.at(-1)?.[0]).toBe(11);
    });
  });
});
