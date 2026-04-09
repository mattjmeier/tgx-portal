import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { fetchAssays, type Assay } from "../api/assays";
import { fetchProject } from "../api/projects";
import { fetchSamples, type Sample } from "../api/samples";
import { fetchStudy } from "../api/studies";
import { useAuth } from "../auth/AuthProvider";
import { collaborationPath } from "../lib/routes";
import { AssayForm } from "./AssayForm";
import { SampleForm } from "./SampleForm";
import { SampleExplorerTable } from "./SampleExplorerTable";
import { SampleUploadPanel } from "./SampleUploadPanel";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

type StudyWorkspaceTab = "samples" | "contrasts" | "collaboration";

const allowedTabs: StudyWorkspaceTab[] = ["samples", "contrasts", "collaboration"];

function parseStudyId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTab(value: string | null): StudyWorkspaceTab {
  if (value && (allowedTabs as string[]).includes(value)) {
    return value as StudyWorkspaceTab;
  }
  return "samples";
}

export function StudyWorkspace() {
  const auth = useAuth();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const studyId = parseStudyId(params.studyId);

  const activeTab = useMemo(() => parseTab(searchParams.get("tab")), [searchParams]);
  const intakeParam = searchParams.get("intake");
  const intakeOpen = intakeParam === "open";

  const [sampleSearch, setSampleSearch] = useState("");
  const [samplePagination, setSamplePagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sampleSorting, setSampleSorting] = useState<SortingState>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<number | null>(null);

  const studyQuery = useQuery({
    queryKey: ["study", studyId],
    queryFn: () => fetchStudy(studyId as number),
    enabled: studyId !== null,
  });

  const projectQuery = useQuery({
    queryKey: ["project", studyQuery.data?.project],
    queryFn: () => fetchProject(studyQuery.data?.project as number),
    enabled: Boolean(studyQuery.data?.project),
  });

  const samplesQuery = useQuery({
    queryKey: ["samples", studyId, samplePagination.pageIndex, samplePagination.pageSize, sampleSearch, sampleSorting],
    queryFn: () =>
      fetchSamples(studyId as number, {
        page: samplePagination.pageIndex + 1,
        pageSize: samplePagination.pageSize,
        search: sampleSearch.trim() ? sampleSearch.trim() : undefined,
        ordering: sampleSorting[0] ? `${sampleSorting[0].desc ? "-" : ""}${sampleSorting[0].id}` : undefined,
      }),
    enabled: studyId !== null && activeTab === "samples",
  });

  const assaysQuery = useQuery({
    queryKey: ["assays", studyId],
    queryFn: () => fetchAssays(studyId as number),
    enabled: studyId !== null && activeTab === "samples",
  });

  useEffect(() => {
    setSamplePagination((current) => ({ ...current, pageIndex: 0 }));
  }, [sampleSearch, sampleSorting, studyId]);

  useEffect(() => {
    const currentSamples = samplesQuery.data?.results ?? [];
    if (currentSamples.length === 0) {
      setSelectedSampleId(null);
      return;
    }

    if (!currentSamples.some((sample) => sample.id === selectedSampleId)) {
      setSelectedSampleId(currentSamples[0].id);
    }
  }, [samplesQuery.data, selectedSampleId]);

  const assaysBySample = useMemo(() => {
    return (assaysQuery.data?.results ?? []).reduce<Record<number, Assay[]>>((accumulator, assay) => {
      accumulator[assay.sample] = [...(accumulator[assay.sample] ?? []), assay];
      return accumulator;
    }, {});
  }, [assaysQuery.data]);

  const selectedSample = useMemo(() => {
    return (samplesQuery.data?.results ?? []).find((sample) => sample.id === selectedSampleId) ?? null;
  }, [samplesQuery.data, selectedSampleId]);

  function setTab(next: StudyWorkspaceTab) {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "samples") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", next);
    }
    setSearchParams(nextParams, { replace: true });
  }

  function setIntake(nextOpen: boolean) {
    const nextParams = new URLSearchParams(searchParams);
    if (nextOpen) {
      nextParams.set("intake", "open");
      if (activeTab !== "samples") {
        nextParams.delete("tab");
      }
    } else {
      nextParams.delete("intake");
    }
    setSearchParams(nextParams, { replace: true });
  }

  const study = studyQuery.data;

  return (
    <section className="workspace-route">
      <div className="min-w-0">
        <p className="eyebrow">Study workspace</p>
        <h2 className="truncate">{study?.title ?? "Study"}</h2>
        {study ? (
          <p className="mt-1 text-sm text-muted-foreground">
            <span>
              {study.species} · {study.celltype}
            </span>
            <span className="mx-2">·</span>
            <Link className="text-primary hover:underline" to={collaborationPath(study.project)}>
              {study.project_title}
            </Link>
          </p>
        ) : null}
      </div>

      {studyQuery.isLoading ? <p>Loading study workspace...</p> : null}
      {studyQuery.isError ? <p className="error-text">Unable to load this study.</p> : null}

      {study ? (
        <Tabs className="mt-4" value={activeTab} onValueChange={(value) => setTab(parseTab(value))}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <TabsList>
              <TabsTrigger value="samples">Samples</TabsTrigger>
              <TabsTrigger value="contrasts">Contrasts</TabsTrigger>
              <TabsTrigger value="collaboration">Collaboration info</TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setIntake(!intakeOpen)}>
                {intakeOpen ? "Hide sample tools" : "Add samples"}
              </Button>
              <Button type="button" onClick={() => setTab("contrasts")}>
                Add contrasts
              </Button>
            </div>
          </div>

          <TabsContent value="samples">
            <div className="mt-4 space-y-6">
              {intakeOpen ? (
                <section className="rounded-lg border border-border bg-background p-5 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">Sample metadata onboarding</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Add samples one-by-one or upload a sheet for bulk intake. These panels are hidden by default to keep the workspace focused on the samples table.
                      </p>
                    </div>
                    <Button type="button" variant="ghost" onClick={() => setIntake(false)}>
                      Close
                    </Button>
                  </div>
                  <div className="mt-5 grid gap-6 lg:grid-cols-2">
                    <SampleForm studyId={study.id} />
                    <SampleUploadPanel studyId={study.id} />
                  </div>
                </section>
              ) : null}

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <SampleExplorerTable
                  samples={samplesQuery.data?.results ?? []}
                  totalCount={samplesQuery.data?.count ?? 0}
                  isLoading={samplesQuery.isLoading}
                  pagination={samplePagination}
                  sorting={sampleSorting}
                  search={sampleSearch}
                  selectedSampleId={selectedSampleId}
                  onPaginationChange={setSamplePagination}
                  onSortingChange={setSampleSorting}
                  onSearchChange={setSampleSearch}
                  onSelectSample={(sample) => setSelectedSampleId(sample.id)}
                />

                <aside className="sample-detail-rail">
                  <div className="section-header compact-header">
                    <div>
                      <p className="eyebrow">Detail panel</p>
                      <h3>Selected sample</h3>
                    </div>
                  </div>
                  {samplesQuery.isError ? <p className="error-text">Unable to load samples.</p> : null}
                  {assaysQuery.isError ? <p className="error-text">Unable to load assays.</p> : null}
                  {selectedSample ? (
                    <article className="project-card detail-card">
                      <p className="project-meta">{selectedSample.sample_ID}</p>
                      <h3>{selectedSample.sample_name}</h3>
                      <p>{selectedSample.description || "No description yet."}</p>

                      <div className="detail-pill-row">
                        <span className="detail-pill">Group: {selectedSample.group}</span>
                        <span className="detail-pill">Dose: {selectedSample.dose}</span>
                        <span className="detail-pill">Chemical: {selectedSample.chemical || "None"}</span>
                      </div>

                      <dl className="detail-definition-list">
                        <div>
                          <dt>Long chemical name</dt>
                          <dd>{selectedSample.chemical_longname || "Not provided"}</dd>
                        </div>
                        <div>
                          <dt>Technical control</dt>
                          <dd>{selectedSample.technical_control ? "Yes" : "No"}</dd>
                        </div>
                        <div>
                          <dt>Reference RNA</dt>
                          <dd>{selectedSample.reference_rna ? "Yes" : "No"}</dd>
                        </div>
                        <div>
                          <dt>Solvent control</dt>
                          <dd>{selectedSample.solvent_control ? "Yes" : "No"}</dd>
                        </div>
                      </dl>

                      <div className="assay-section">
                        <h4>Assays</h4>
                        {assaysBySample[selectedSample.id]?.length ? (
                          <div className="assay-list">
                            {assaysBySample[selectedSample.id].map((assay) => (
                              <article className="assay-chip" key={assay.id}>
                                <div>
                                  <strong>{assay.platform === "rna_seq" ? "RNA-Seq" : "TempO-Seq"}</strong>
                                  <p>
                                    {assay.genome_version} / {assay.quantification_method}
                                  </p>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="muted-copy">No assays yet for this sample.</p>
                        )}
                        {auth.user?.profile.role === "admin" ? <AssayForm sampleId={selectedSample.id} studyId={study.id} /> : null}
                      </div>
                    </article>
                  ) : (
                    <article className="empty-card detail-empty-card">
                      <h3>No sample selected</h3>
                      <p>Select a row in the explorer to review metadata and assay coverage.</p>
                    </article>
                  )}
                </aside>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contrasts">
            <section className="rounded-lg border border-border bg-background p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-foreground">Contrasts for this study</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Contrast configuration will live here once metadata onboarding (template + upload + mapping) is implemented. For now, use the sample table to confirm intake.
              </p>
            </section>
          </TabsContent>

          <TabsContent value="collaboration">
            <section className="rounded-lg border border-border bg-background p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-foreground">Collaboration context</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Keep collaboration ownership and high-level context close while working in the study workspace.
              </p>
              <div className="mt-5 grid gap-3">
                <div className="rounded-md border border-border bg-muted/20 p-4">
                  <p className="text-sm font-semibold text-foreground">{projectQuery.data?.title ?? study.project_title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    PI {projectQuery.data?.pi_name ?? "Unknown"}
                    {projectQuery.data?.owner ? ` · Owner: ${projectQuery.data.owner}` : ""}
                  </p>
                  {projectQuery.data?.description ? (
                    <p className="mt-2 text-sm text-muted-foreground">{projectQuery.data.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to={collaborationPath(study.project)}>Open collaboration</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      ) : null}
    </section>
  );
}
