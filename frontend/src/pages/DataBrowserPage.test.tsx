import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { DataBrowserPage } from "./DataBrowserPage";
import { createDataExport, fetchDataBrowserFacets, fetchDataBrowserStudies } from "../api/dataBrowser";

vi.mock("../api/dataBrowser", async () => {
  const actual = await vi.importActual<typeof import("../api/dataBrowser")>("../api/dataBrowser");
  return {
    ...actual,
    fetchDataBrowserStudies: vi.fn(),
    fetchDataBrowserFacets: vi.fn(),
    createDataExport: vi.fn(),
  };
});

const matrix = {
  id: 31,
  resource_id: 41,
  display_name: "counts.tsv",
  value_type: "raw_counts",
  feature_id_kind: "ensembl_gene_id",
  annotation_source: "Ensembl",
  annotation_version: "110",
  feature_count: 18420,
  matrix_column_count: 2,
  validation_status: "valid",
  validation_errors: [],
  compatibility_key: [2, "human", "raw_counts", "ensembl_gene_id", "Ensembl", "110"],
  browser_ready: true,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/data?ready=true"]}>
        <Routes><Route path="/data" element={<DataBrowserPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DataBrowserPage", () => {
  beforeEach(() => {
    vi.mocked(fetchDataBrowserStudies).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 1,
        study_id: 11,
        study_name: "tgx-001",
        title: "BPA hepatocyte study",
        collaboration: { id: 7, title: "Regulatory program" },
        species: "human",
        cell_type: "Hepatocyte",
        study_type: "TGx",
        curation_status: "metadata_curated",
        lineage_status: "complete",
        sample_count: 2,
        platform: { id: 2, name: "rna-v1", title: "RNA v1", technology_type: "RNA-Seq" },
        chemicals: [{ id: 9, label: "Bisphenol A", chemical_sample_id: "BPA", dtxsid: "DTXSID7020182", casrn: "80-05-7" }],
        primary_matrix: matrix,
        browser_ready: true,
      }],
    });
    vi.mocked(fetchDataBrowserFacets).mockResolvedValue({ facets: {
      chemical: [{ value: 9, label: "Bisphenol A", count: 1 }],
      technology: [{ value: "RNA-Seq", label: "RNA-Seq", count: 1 }],
      species: [{ value: "human", label: "human", count: 1 }],
      ready: [{ value: "true", label: "Ready", count: 1 }],
      platform: [], cell_type: [], study_type: [], value_type: [], curation: [], availability: [],
    } });
    vi.mocked(createDataExport).mockResolvedValue({ id: 5, status: "queued", matrix_ids: [31], feature_count: null, failure_detail: "", output_filename: "", created_at: "" });
  });

  it("facets studies through the URL and creates an export from selected matrices", async () => {
    renderPage();
    expect((await screen.findAllByText("BPA hepatocyte study")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("checkbox", { name: /select BPA hepatocyte study/i }));
    expect(screen.getByText(/1 dataset selected/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /generate combined export/i }));

    await waitFor(() => expect(createDataExport).toHaveBeenCalledWith([31], expect.any(Object)));
  });
});
