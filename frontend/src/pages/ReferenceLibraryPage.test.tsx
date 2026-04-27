import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

import { fetchReferenceLibrary, type ReferenceLibraryResponse } from "../api/referenceLibrary";
import { ReferenceLibraryPage } from "./ReferenceLibraryPage";

vi.mock("../api/referenceLibrary", async () => {
  const actual = await vi.importActual<typeof import("../api/referenceLibrary")>("../api/referenceLibrary");

  return {
    ...actual,
    fetchReferenceLibrary: vi.fn(),
  };
});

const referenceLibrary: ReferenceLibraryResponse = {
  version: 1,
  summary: {
    species_count: 4,
    assay_platform_count: 2,
    profiling_platform_count: 2,
    technology_type_count: 2,
    controlled_lookup_count: 6,
    drift_warning_count: 1,
  },
  hierarchy: [
    {
      name: "Collaboration",
      description: "Top-level container used for ownership, intake, and reporting.",
      app_boundary: "core.Project",
    },
    {
      name: "Profiling platform",
      description: "Canonical reusable platform or feature-set registry aligned with UL tgx_platforms.",
      app_boundary: "profiling.ProfilingPlatform",
    },
  ],
  species: [
    { value: "human", label: "Human" },
    { value: "mouse", label: "Mouse" },
  ],
  assay_platforms: [
    { value: "tempo_seq", label: "TempO-Seq" },
    { value: "rna_seq", label: "RNA-Seq" },
  ],
  technology_types: [
    { value: "RNA-Seq", label: "RNA-Seq", platform_count: 1 },
    { value: "TempO-Seq", label: "TempO-Seq", platform_count: 1 },
  ],
  controlled_lookups: {
    platform: { label: "Platform", values: ["TempO-Seq", "RNA-Seq", "DrugSeq"] },
    biospyder_kit: {
      label: "Biospyder kit",
      values: [{ label: "Human Whole Transcriptome 2.1", value: "hwt2-1" }],
    },
  },
  profiling_platforms: [
    {
      id: 1,
      platform_name: "humanWT2_1_brAtten",
      title: "TempO-seq Human WT v2.1, Broad Attenuation",
      description: "BioSpyder human whole-transcriptome probe set with broad attenuation.",
      version: "2.1",
      technology_type: "TempO-Seq",
      study_type: "HTTr",
      species: "human",
      species_label: "Human",
      url: "",
      ext: { biospyder_kit: "hwt2-1" },
      study_count: 3,
    },
    {
      id: 2,
      platform_name: "rnaseq_hg38_demo",
      title: "RNA-seq hg38 demonstration platform",
      description: "Seeded profiling platform for admin schema exploration.",
      version: "hg38",
      technology_type: "RNA-Seq",
      study_type: "TGx",
      species: "human",
      species_label: "Human",
      url: "",
      ext: {},
      study_count: 1,
    },
  ],
  drift_warnings: [
    {
      category: "platform",
      value: "DrugSeq",
      message: "Operational platform lookup has no matching profiling platform technology type.",
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ReferenceLibraryPage />
    </QueryClientProvider>,
  );
}

describe("ReferenceLibraryPage", () => {
  beforeEach(() => {
    vi.mocked(fetchReferenceLibrary).mockResolvedValue(referenceLibrary);
  });

  it("renders canonical platform summaries from the API", async () => {
    renderPage();

    expect(await screen.findByText("Canonical platforms")).toBeInTheDocument();
    expect(screen.getByText("humanWT2_1_brAtten")).toBeInTheDocument();
    expect(screen.getByText("RNA-seq hg38 demonstration platform")).toBeInTheDocument();
    expect(screen.getByText("1 drift warning")).toBeInTheDocument();
  });

  it("filters platforms and opens platform details", async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText("Search reference library"), { target: { value: "rnaseq" } });

    expect(screen.getByText("rnaseq_hg38_demo")).toBeInTheDocument();
    expect(screen.queryByText("humanWT2_1_brAtten")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /view rnaseq_hg38_demo details/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("RNA-seq hg38 demonstration platform")).toBeInTheDocument();
    expect(within(dialog).getByText("profiling.ProfilingPlatform")).toBeInTheDocument();
  });
});
