import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Filter, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import {
  createDataExport,
  dataExportDownloadUrl,
  fetchDataBrowserFacets,
  fetchDataBrowserStudies,
  fetchDataBrowserStudy,
  fetchDataExport,
  fetchMatrixPreview,
  type CountMatrixSummary,
  type DataBrowserStudy,
  type FacetBucket,
} from "../api/dataBrowser";
import { getStoredAuthToken } from "../api/http";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

const facetLabels: Record<string, string> = {
  chemical: "Chemical",
  technology: "Technology",
  platform: "Platform",
  species: "Species",
  cell_type: "Cell type",
  study_type: "Study type",
  value_type: "Count value type",
  curation: "Curation",
  availability: "Availability",
  ready: "Readiness",
};
const facetOrder = ["chemical", "technology", "species", "cell_type", "study_type", "value_type", "curation", "availability", "platform", "ready"];

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function currentFilters(params: URLSearchParams): Record<string, string[]> {
  const filters = Object.fromEntries(facetOrder.map((key) => [key, params.getAll(key)]).filter(([, values]) => values.length > 0));
  const search = params.get("search");
  return search ? { ...filters, search: [search] } : filters;
}

function FacetRail({ params, facets, onToggle, chemicalSearch, onChemicalSearch }: {
  params: URLSearchParams;
  facets: Record<string, FacetBucket[]>;
  onToggle: (facet: string, value: string) => void;
  chemicalSearch?: string;
  onChemicalSearch?: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5" aria-label="Dataset filters">
      {facetOrder.map((facet) => {
        const values = facets[facet] ?? [];
        if (values.length === 0) return null;
        return (
          <fieldset className="space-y-2" key={facet}>
            <legend className="text-sm font-semibold text-foreground">{facetLabels[facet]}</legend>
            {facet === "chemical" && onChemicalSearch ? <Input aria-label="Search chemical facets" className="h-8" placeholder="Name, CASRN, DTXSID…" value={chemicalSearch ?? ""} onChange={(event) => onChemicalSearch(event.target.value)} /> : null}
            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {values.map((bucket) => {
                const value = String(bucket.value);
                const id = `facet-${facet}-${value.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                return (
                  <div className="flex items-center gap-2" key={value}>
                    <Checkbox
                      id={id}
                      checked={params.getAll(facet).includes(value)}
                      onCheckedChange={() => onToggle(facet, value)}
                    />
                    <Label className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 font-normal" htmlFor={id}>
                      <span className="truncate">{bucket.label || value}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{bucket.count}</span>
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function MatrixDetailsSheet({ studyId, onClose }: { studyId: number | null; onClose: () => void }) {
  const detailQuery = useQuery({
    queryKey: ["data-browser-study", studyId],
    queryFn: () => fetchDataBrowserStudy(studyId as number),
    enabled: studyId !== null,
  });
  const primaryMatrixId = detailQuery.data?.primary_matrix?.id ?? null;
  const previewQuery = useQuery({
    queryKey: ["count-matrix-preview", primaryMatrixId],
    queryFn: () => fetchMatrixPreview(primaryMatrixId as number),
    enabled: primaryMatrixId !== null,
  });
  return (
    <Sheet open={studyId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{detailQuery.data?.title ?? "Dataset details"}</SheetTitle>
          <SheetDescription>{detailQuery.data?.study_name ?? "Loading provenance and matrix metadata…"}</SheetDescription>
        </SheetHeader>
        {detailQuery.isError ? <p className="mt-6 text-sm text-destructive">{detailQuery.error.message}</p> : null}
        {detailQuery.data ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-muted-foreground">Collaboration</span><p className="font-medium">{detailQuery.data.collaboration.title}</p></div>
              <div><span className="text-muted-foreground">Platform</span><p className="font-medium">{detailQuery.data.platform?.title ?? "Not curated"}</p></div>
              <div><span className="text-muted-foreground">Samples</span><p className="font-medium">{detailQuery.data.sample_count}</p></div>
              <div><span className="text-muted-foreground">Curation</span><p className="font-medium">{titleCase(detailQuery.data.curation_status)}</p></div>
            </div>
            {(detailQuery.data.matrices ?? []).map((matrix) => (
              <Card key={matrix.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div><CardTitle className="text-base">{matrix.display_name}</CardTitle><CardDescription>{matrix.feature_count.toLocaleString()} features · {matrix.matrix_column_count.toLocaleString()} columns</CardDescription></div>
                    <Badge variant={matrix.browser_ready ? "secondary" : "outline"}>{matrix.browser_ready ? "Ready" : "Needs curation"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Values:</span> {titleCase(matrix.value_type)}</p>
                  <p><span className="text-muted-foreground">Features:</span> {matrix.feature_id_kind}</p>
                  <p><span className="text-muted-foreground">Annotation:</span> {matrix.annotation_source} {matrix.annotation_version}</p>
                  <p><span className="text-muted-foreground">Mapped:</span> {matrix.mapped_column_count}/{matrix.matrix_column_count}</p>
                  <p className="break-all sm:col-span-2"><span className="text-muted-foreground">Checksum:</span> {matrix.checksum || "Not recorded"}</p>
                </CardContent>
              </Card>
            ))}
            <div>
              <h3 className="mb-2 font-semibold">Matrix preview</h3>
              {previewQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading bounded preview…</p> : null}
              {previewQuery.isError ? <p className="text-sm text-destructive">{previewQuery.error.message}</p> : null}
              {previewQuery.data ? (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader><TableRow>{previewQuery.data.columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader>
                    <TableBody>{previewQuery.data.rows.map((row, index) => <TableRow key={`${row[0]}-${index}`}>{row.map((value, cell) => <TableCell key={cell}>{value}</TableCell>)}</TableRow>)}</TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function DataBrowserPage() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<number, { study: DataBrowserStudy; matrix: CountMatrixSummary }>>(new Map());
  const [matrixChoices, setMatrixChoices] = useState<Map<number, number>>(new Map());
  const [detailStudyId, setDetailStudyId] = useState<number | null>(null);
  const [activeExportId, setActiveExportId] = useState<number | null>(null);
  const [chemicalFacetSearch, setChemicalFacetSearch] = useState("");

  useEffect(() => {
    if (!params.has("ready")) {
      const next = new URLSearchParams(params);
      next.set("ready", "true");
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const paramsKey = params.toString();
  const studiesQuery = useQuery({ queryKey: ["data-browser-studies", paramsKey, page], queryFn: () => fetchDataBrowserStudies(params, page) });
  const facetsQuery = useQuery({
    queryKey: ["data-browser-facets", paramsKey, chemicalFacetSearch],
    queryFn: () => {
      const facetParams = new URLSearchParams(params);
      if (chemicalFacetSearch.trim()) facetParams.set("chemical_search", chemicalFacetSearch.trim());
      return fetchDataBrowserFacets(facetParams);
    },
  });
  const exportMutation = useMutation({
    mutationFn: () => createDataExport(Array.from(selected.keys()), currentFilters(params)),
    onSuccess: (data) => setActiveExportId(data.id),
  });
  const exportQuery = useQuery({
    queryKey: ["data-export", activeExportId],
    queryFn: () => fetchDataExport(activeExportId as number),
    enabled: activeExportId !== null,
    refetchInterval: (query) => ["queued", "running"].includes(query.state.data?.status ?? "") ? 1500 : false,
  });

  const compatibility = useMemo(() => {
    const entries = Array.from(selected.values());
    if (entries.length < 2) return { compatible: true, conflicts: [] as string[] };
    const first = entries[0].matrix.compatibility_key;
    const labels = ["platform", "species", "value type", "feature identifier", "annotation source", "annotation version"];
    const conflicts = labels.filter((_, index) => entries.some((entry) => entry.matrix.compatibility_key[index] !== first[index]));
    return { compatible: conflicts.length === 0, conflicts };
  }, [selected]);

  const toggleFacet = (facet: string, value: string) => {
    const next = new URLSearchParams(params);
    const values = next.getAll(facet);
    next.delete(facet);
    (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]).forEach((item) => next.append(facet, item));
    setPage(1);
    setParams(next);
  };
  const clearFilters = () => {
    setPage(1);
    setParams({ ready: "true" });
  };
  const updateSearch = (value: string) => {
    const next = new URLSearchParams(params);
    value.trim() ? next.set("search", value) : next.delete("search");
    setPage(1);
    setParams(next, { replace: true });
  };
  const chosenMatrix = (study: DataBrowserStudy) => {
    const matrixId = matrixChoices.get(study.id) ?? study.primary_matrix?.id;
    return (study.matrices ?? []).find((matrix) => matrix.id === matrixId) ?? study.primary_matrix;
  };
  const toggleStudy = (study: DataBrowserStudy) => {
    const matrix = chosenMatrix(study);
    if (!matrix) return;
    setSelected((current) => {
      const next = new Map(current);
      next.has(matrix.id)
        ? next.delete(matrix.id)
        : next.set(matrix.id, { study, matrix });
      return next;
    });
  };
  const chooseMatrix = (study: DataBrowserStudy, matrixId: number) => {
    const previous = chosenMatrix(study);
    const nextMatrix = (study.matrices ?? []).find((matrix) => matrix.id === matrixId);
    if (!nextMatrix) return;
    setMatrixChoices((current) => new Map(current).set(study.id, matrixId));
    setSelected((current) => {
      if (!previous || !current.has(previous.id)) return current;
      const next = new Map(current);
      next.delete(previous.id);
      next.set(nextMatrix.id, { study, matrix: nextMatrix });
      return next;
    });
  };

  const activeChips = facetOrder.flatMap((facet) => params.getAll(facet).map((value) => ({ facet, value })));
  const studies = studiesQuery.data?.results ?? [];
  const pageCount = Math.max(1, Math.ceil((studiesQuery.data?.count ?? 0) / 20));
  const completedExport = exportQuery.data?.status === "completed" ? exportQuery.data : null;

  const downloadExport = async () => {
    if (!completedExport) return;
    const response = await fetch(dataExportDownloadUrl(completedExport.id), { headers: { Authorization: `Token ${getStoredAuthToken() ?? ""}` } });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = completedExport.output_filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="workspace-route space-y-5">
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div><p className="eyebrow">Warehouse</p><CardTitle className="text-xl">Data browser</CardTitle><CardDescription className="mt-2">Find curated study datasets and create provenance-preserving cross-study count exports.</CardDescription></div>
            <div className="text-sm text-muted-foreground">{studiesQuery.data?.count ?? 0} matching studies</div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search datasets" className="pl-9" placeholder="Search studies, samples, chemicals, or IDs…" value={params.get("search") ?? ""} onChange={(event) => updateSearch(event.target.value)} /></div>
            <Sheet>
              <SheetTrigger asChild><Button className="lg:hidden" variant="outline"><Filter />Filters</Button></SheetTrigger>
              <SheetContent side="left" className="overflow-y-auto"><SheetHeader><SheetTitle>Dataset filters</SheetTitle><SheetDescription>Counts update against the other active facets.</SheetDescription></SheetHeader><div className="mt-6"><FacetRail params={params} facets={facetsQuery.data?.facets ?? {}} onToggle={toggleFacet} chemicalSearch={chemicalFacetSearch} onChemicalSearch={setChemicalFacetSearch} /></div></SheetContent>
            </Sheet>
            <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
          </div>
          {activeChips.length > 0 ? <div className="flex flex-wrap gap-2" aria-label="Active filters">{activeChips.map(({ facet, value }) => <button key={`${facet}-${value}`} type="button" onClick={() => toggleFacet(facet, value)}><Badge variant="outline">{facetLabels[facet]}: {value}<X className="size-3" /></Badge></button>)}</div> : null}
        </CardHeader>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Card className="sticky top-4 hidden lg:block"><CardHeader><CardTitle className="text-base">Filters</CardTitle><CardDescription>OR within a facet; AND across facets.</CardDescription></CardHeader><CardContent><FacetRail params={params} facets={facetsQuery.data?.facets ?? {}} onToggle={toggleFacet} chemicalSearch={chemicalFacetSearch} onChemicalSearch={setChemicalFacetSearch} /></CardContent></Card>
        <Card>
          <CardContent className="pt-6">
            {studiesQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading study datasets…</p> : null}
            {studiesQuery.isError ? <p className="text-sm text-destructive">{studiesQuery.error.message}</p> : null}
            {!studiesQuery.isLoading && !studiesQuery.isError && studies.length === 0 ? <p className="text-sm text-muted-foreground">No study datasets match the active filters.</p> : null}
            {studies.length > 0 ? (
              <>
              <div className="space-y-3 md:hidden">
                {studies.map((study) => {
                  const matrix = chosenMatrix(study);
                  const checked = matrix ? selected.has(matrix.id) : false;
                  return <Card key={`mobile-${study.id}`}>
                    <CardContent className="space-y-3 pt-5">
                      <div className="flex items-start gap-3">
                        <Checkbox aria-label={`Select mobile dataset ${study.title}`} checked={checked} disabled={!study.browser_ready || !matrix} onCheckedChange={() => toggleStudy(study)} />
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{study.title}</p><Badge variant={study.browser_ready ? "secondary" : "outline"}>{study.browser_ready ? "Ready" : "Needs curation"}</Badge></div><p className="text-sm text-muted-foreground">{study.study_name} · {study.collaboration.title}</p></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm"><p><span className="text-muted-foreground">Technology</span><br />{study.platform?.technology_type ?? "—"}</p><p><span className="text-muted-foreground">Samples</span><br />{study.sample_count.toLocaleString()}</p></div>
                      <p className="text-xs text-muted-foreground">{study.chemicals.map((chemical) => chemical.label).join(", ") || "Canonical chemical coverage unavailable"} · {study.cell_type || "Cell type pending"}</p>
                      {matrix ? <div className="space-y-1">{(study.matrices?.length ?? 0) > 1 ? <select aria-label={`Mobile count matrix for ${study.title}`} className="w-full rounded-md border bg-background px-2 py-1 text-sm" value={matrix.id} onChange={(event) => chooseMatrix(study, Number(event.target.value))}>{study.matrices!.map((option) => <option key={option.id} value={option.id}>{option.display_name}{option.is_primary ? " (primary)" : ""}</option>)}</select> : <p className="text-sm">{matrix.display_name}</p>}<p className="text-xs text-muted-foreground">{titleCase(matrix.value_type)} · {matrix.feature_count.toLocaleString()} features</p></div> : null}
                      <Button className="w-full" size="sm" variant="outline" onClick={() => setDetailStudyId(study.id)}>Details</Button>
                    </CardContent>
                  </Card>;
                })}
              </div>
              <div className="hidden overflow-x-auto rounded-md border md:block">
                <Table>
                  <TableHeader><TableRow><TableHead className="w-10"><span className="sr-only">Select</span></TableHead><TableHead>Study dataset</TableHead><TableHead>Technology</TableHead><TableHead>Samples</TableHead><TableHead>Count matrix</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                  <TableBody>{studies.map((study) => {
                    const matrix = chosenMatrix(study);
                    const checked = matrix ? selected.has(matrix.id) : false;
                    return <TableRow key={study.id}>
                      <TableCell><Checkbox aria-label={`Select ${study.title}`} checked={checked} disabled={!study.browser_ready || !matrix} onCheckedChange={() => toggleStudy(study)} /></TableCell>
                      <TableCell><div className="min-w-60"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{study.title}</span><Badge variant={study.browser_ready ? "secondary" : "outline"}>{study.browser_ready ? "Ready" : "Needs curation"}</Badge></div><p className="text-sm text-muted-foreground">{study.study_name} · {study.collaboration.title}</p><p className="mt-1 text-xs text-muted-foreground">{study.chemicals.map((chemical) => chemical.label).join(", ") || "Canonical chemical coverage unavailable"} · {study.cell_type || "Cell type pending"}</p></div></TableCell>
                      <TableCell><p>{study.platform?.technology_type ?? "—"}</p><p className="text-xs text-muted-foreground">{study.platform?.name}</p></TableCell>
                      <TableCell className="tabular-nums">{study.sample_count.toLocaleString()}</TableCell>
                      <TableCell>{matrix ? <div className="space-y-1">{(study.matrices?.length ?? 0) > 1 ? <select aria-label={`Count matrix for ${study.title}`} className="max-w-56 rounded-md border bg-background px-2 py-1 text-sm" value={matrix.id} onChange={(event) => chooseMatrix(study, Number(event.target.value))}>{study.matrices!.map((option) => <option key={option.id} value={option.id}>{option.display_name}{option.is_primary ? " (primary)" : ""}</option>)}</select> : <p>{matrix.display_name}</p>}<p className="text-xs text-muted-foreground">{titleCase(matrix.value_type)} · {matrix.feature_count.toLocaleString()} features</p></div> : "No primary matrix"}</TableCell>
                      <TableCell><Button size="sm" variant="outline" onClick={() => setDetailStudyId(study.id)}>Details</Button></TableCell>
                    </TableRow>;
                  })}</TableBody>
                </Table>
              </div>
              </>
            ) : null}
            <div className="mt-4 flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {page} of {pageCount}</p><div className="flex gap-2"><Button aria-label="Previous page" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft />Previous</Button><Button aria-label="Next page" size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight /></Button></div></div>
          </CardContent>
        </Card>
      </div>

      {selected.size > 0 ? (
        <Card className="sticky bottom-4 z-30 border-primary/30 shadow-lg"><CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold">{selected.size} dataset{selected.size === 1 ? "" : "s"} selected</p>{compatibility.compatible ? <p className="text-sm text-muted-foreground">Compatible for strict feature-intersection export.</p> : <p className="text-sm text-destructive">Conflicting {compatibility.conflicts.join(", ")}. Adjust the selection to continue.</p>}{exportMutation.isError ? <p className="text-sm text-destructive">{exportMutation.error.message}</p> : null}{exportQuery.data?.status === "failed" ? <p className="text-sm text-destructive">{exportQuery.data.failure_detail}</p> : null}{exportQuery.data && ["queued", "running"].includes(exportQuery.data.status) ? <p className="text-sm text-muted-foreground">Export {exportQuery.data.status}…</p> : null}</div><div className="flex gap-2"><Button variant="outline" onClick={() => setSelected(new Map())}>Clear selection</Button>{completedExport ? <Button onClick={() => void downloadExport()}><Download />Download export</Button> : <Button disabled={!compatibility.compatible || exportMutation.isPending} onClick={() => exportMutation.mutate()}>Generate combined export</Button>}</div></CardContent></Card>
      ) : null}
      <MatrixDetailsSheet studyId={detailStudyId} onClose={() => setDetailStudyId(null)} />
    </section>
  );
}
