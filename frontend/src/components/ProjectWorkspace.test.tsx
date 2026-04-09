import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

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
          species: "human",
          celltype: "breast epithelial",
          treatment_var: "estrogen",
          batch_var: "batch-a",
        },
        {
          id: 12,
          project: 7,
          project_title: "Endocrine Resilience Screen",
          title: "MCF7 recovery window",
          species: "human",
          celltype: "breast epithelial",
          treatment_var: "recovery",
          batch_var: "batch-b",
        },
      ],
    })),
    deleteStudy: vi.fn(async () => undefined),
  };
});

vi.mock("../api/samples", async () => {
  const actual = await vi.importActual<typeof import("../api/samples")>("../api/samples");
  return {
    ...actual,
    fetchSamples: vi.fn(async () => ({
      count: 3,
      next: null,
      previous: null,
      results: [
        {
          id: 101,
          study: 11,
          sample_ID: "S-001",
          sample_name: "Vehicle control 1",
          description: "",
          group: "control",
          dose: "0",
          chemical: "",
          chemical_longname: "",
          technical_control: false,
          reference_rna: false,
          solvent_control: false,
        },
      ],
    })),
    deleteSample: vi.fn(async () => undefined),
  };
});

vi.mock("../api/assays", async () => {
  const actual = await vi.importActual<typeof import("../api/assays")>("../api/assays");
  return {
    ...actual,
    fetchAssays: vi.fn(async () => ({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 501,
          sample: 101,
          platform: "rna_seq" as const,
          genome_version: "hg38",
          quantification_method: "salmon",
        },
      ],
    })),
    deleteAssay: vi.fn(async () => undefined),
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

vi.mock("./SampleForm", () => ({
  SampleForm: () => <div>Sample form</div>,
}));

vi.mock("./SampleUploadPanel", () => ({
  SampleUploadPanel: () => <div>Sample upload panel</div>,
}));

vi.mock("./SampleExplorerTable", () => ({
  SampleExplorerTable: () => <div>Sample explorer table</div>,
}));

vi.mock("./AssayForm", () => ({
  AssayForm: () => <div>Assay form</div>,
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
          initialStudyId={11}
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
    expect(screen.getByText(/^2$/i)).toBeInTheDocument();
    expect(screen.getByText(/^3$/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add study/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /new study/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download config bundle/i })).not.toBeInTheDocument();
  });

  it("shows studies in a table layout consistent with the studies directory", async () => {
    renderWorkspace();

    expect(await screen.findByRole("columnheader", { name: /study/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /actions/i })).toBeInTheDocument();
    expect(await screen.findByText(/mcf7 estrogen pulse/i)).toBeInTheDocument();
    expect(screen.getAllByText(/breast epithelial/i).length).toBeGreaterThan(0);
  });

  it("does not show explanatory tooltip affordances in the streamlined layout", async () => {
    renderWorkspace();

    await screen.findByRole("heading", { name: /endocrine resilience screen/i });

    expect(screen.queryByRole("button", { name: /what is this collaboration workspace\?/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /when should i add a study\?/i })).not.toBeInTheDocument();
  });
});
