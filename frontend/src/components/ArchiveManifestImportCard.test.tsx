import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

import { ArchiveManifestImportCard } from "./ArchiveManifestImportCard";

const previewArchiveManifestMock = vi.fn();
const applyArchiveManifestMock = vi.fn();

vi.mock("../api/studyImports", async () => {
  const actual = await vi.importActual<typeof import("../api/studyImports")>("../api/studyImports");
  return {
    ...actual,
    previewArchiveManifest: (...args: unknown[]) => previewArchiveManifestMock(...args),
    applyArchiveManifest: (...args: unknown[]) => applyArchiveManifestMock(...args),
  };
});

describe("ArchiveManifestImportCard", () => {
  beforeEach(() => {
    previewArchiveManifestMock.mockResolvedValue({
      study_key: "pilot-study",
      outcome: "changes",
      source_digest: "abc123",
      curation_status: "inventory",
      artifact_count: 2,
      missing_artifacts: ["config", "counts"],
      warnings: [],
      created: { study: [], samples: [], resources: [] },
      updated: { study: ["pilot-study"], samples: [], resources: [] },
      stale: { samples: ["retired_sample"], resources: [] },
    });
    applyArchiveManifestMock.mockResolvedValue({
      study_key: "pilot-study",
      outcome: "completed",
      created: 4,
      updated: 0,
      stale: {},
      warnings: [],
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("previews and explicitly applies a descriptor from the read-only archive", async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ArchiveManifestImportCard />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Manifest path"), {
      target: { value: "/data/studies/pilot-study/portal-study.yaml" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview archive import" }));

    expect(await screen.findByText("pilot-study")).toBeInTheDocument();
    expect(screen.getByText(/config, counts/i)).toBeInTheDocument();
    expect(screen.getByText(/stale records retained/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply archive import" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Apply archive import" }));
    await waitFor(() =>
      expect(applyArchiveManifestMock).toHaveBeenCalledWith(
        "/data/studies/pilot-study/portal-study.yaml",
        expect.anything(),
      ),
    );
    expect(await screen.findByText(/completed/i)).toBeInTheDocument();
  });
});
