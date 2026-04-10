import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { fetchAssays, type Assay } from "../api/assays";
import { downloadProjectConfig, fetchProject } from "../api/projects";
import { fetchSamples, type Sample } from "../api/samples";
import { fetchStudy } from "../api/studies";
import { fetchStudyOnboardingState } from "../api/studyOnboarding";
import { useAuth } from "../auth/AuthProvider";
import { collaborationPath, studyOnboardingPath } from "../lib/routes";
import { AssayForm } from "./AssayForm";
import { SampleForm } from "./SampleForm";
import { StudyActionsMenu } from "./StudyActionsMenu";
import { SampleExplorerTable } from "./SampleExplorerTable";
import { SampleUploadPanel } from "./SampleUploadPanel";
import { WorkspaceDetailFieldList } from "./WorkspaceDetailFieldList";
import { WorkspaceSectionCard } from "./WorkspaceSectionCard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { CardDescription } from "./ui/card";
import { Separator } from "./ui/separator";
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

  const onboardingStateQuery = useQuery({
    queryKey: ["study-onboarding-state", studyId],
    queryFn: () => fetchStudyOnboardingState(studyId as number),
    enabled: studyId !== null,
  });

  const assaysQuery = useQuery({
    queryKey: ["assays", studyId],
    queryFn: () => fetchAssays(studyId as number),
    enabled: studyId !== null && activeTab === "samples",
  });

  const configMutation = useMutation({
    mutationFn: downloadProjectConfig,
    onSuccess: (blob, projectIdForDownload) => {
      const safeTitle = (projectQuery.data?.title ?? `collaboration_${projectIdForDownload ?? "unknown"}`)
        .toLowerCase()
        .replace(/\s+/g, "_");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `config_bundle_${safeTitle}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
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
  const selectedSampleFields = useMemo(
    () =>
      selectedSample
        ? [
            { label: "Long chemical name", value: selectedSample.chemical_longname || "Not provided" },
            { label: "Technical control", value: selectedSample.technical_control ? "Yes" : "No" },
            { label: "Reference RNA", value: selectedSample.reference_rna ? "Yes" : "No" },
            { label: "Solvent control", value: selectedSample.solvent_control ? "Yes" : "No" },
          ]
        : [],
    [selectedSample],
  );

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
              {study.species && study.celltype ? `${study.species} · ${study.celltype}` : "Draft metadata pending"}
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
          {onboardingStateQuery.data?.status === "draft" ? (
            <section className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Finish study onboarding</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This study has a saved onboarding draft. Continue in the wizard to finish metadata setup and mappings.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm">
                    <Link to={studyOnboardingPath(study.id)}>Continue onboarding</Link>
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

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
              <StudyActionsMenu
                collaborationId={study.project}
                onDownloadConfig={auth.user?.profile.role === "admin" ? () => configMutation.mutate(study.project) : undefined}
                showOpenStudy={false}
                studyId={study.id}
                studyTitle={study.title}
                triggerClassName="shrink-0"
                triggerLabel="More study actions"
                triggerVariant="outline"
              />
            </div>
          </div>

          <TabsContent value="samples">
            <div className="mt-4 flex flex-col gap-6">
              {intakeOpen ? (
                <WorkspaceSectionCard
                  action={
                    <Button type="button" variant="ghost" onClick={() => setIntake(false)}>
                      Close
                    </Button>
                  }
                  contentClassName="grid gap-6 lg:grid-cols-2"
                  description="Add samples one-by-one or upload a sheet for bulk intake. These panels are hidden by default to keep the workspace focused on the samples table."
                  eyebrow="Onboarding"
                  title="Sample metadata onboarding"
                >
                  <div className="contents">
                    <SampleForm studyId={study.id} />
                    <SampleUploadPanel studyId={study.id} />
                  </div>
                </WorkspaceSectionCard>
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

                <aside className="grid gap-4">
                  {samplesQuery.isError ? <p className="error-text">Unable to load samples.</p> : null}
                  {assaysQuery.isError ? <p className="error-text">Unable to load assays.</p> : null}
                  {selectedSample ? (
                    <WorkspaceSectionCard
                      className="h-full"
                      contentClassName="flex h-full flex-col gap-5"
                      description="Review the currently selected sample without leaving the explorer."
                      eyebrow="Detail panel"
                      title="Selected sample"
                    >
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">{selectedSample.sample_ID}</p>
                        <div className="flex flex-col gap-1">
                          <h3 className="text-xl font-semibold text-foreground">{selectedSample.sample_name}</h3>
                          <CardDescription className="text-sm leading-6">
                            {selectedSample.description || "No description yet."}
                          </CardDescription>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge className="rounded-full px-3 py-1 text-sm" variant="secondary">
                          Group: {selectedSample.group}
                        </Badge>
                        <Badge className="rounded-full px-3 py-1 text-sm" variant="secondary">
                          Dose: {selectedSample.dose}
                        </Badge>
                        <Badge className="rounded-full px-3 py-1 text-sm" variant="secondary">
                          Chemical: {selectedSample.chemical || "None"}
                        </Badge>
                      </div>

                      <WorkspaceDetailFieldList fields={selectedSampleFields} />

                      <Separator />

                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                          <h4 className="text-sm font-semibold text-foreground">Assays</h4>
                          <p className="text-sm text-muted-foreground">Recorded assay coverage for the selected sample.</p>
                        </div>
                        {assaysBySample[selectedSample.id]?.length ? (
                          <div className="grid gap-3">
                            {assaysBySample[selectedSample.id].map((assay) => (
                              <article className="flex items-start justify-between gap-4 rounded-lg border bg-muted/20 p-4" key={assay.id}>
                                <div className="flex flex-col gap-1">
                                  <strong>{assay.platform === "rna_seq" ? "RNA-Seq" : "TempO-Seq"}</strong>
                                  <p className="text-sm text-muted-foreground">
                                    {assay.genome_version} / {assay.quantification_method}
                                  </p>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No assays yet for this sample.</p>
                        )}
                        {auth.user?.profile.role === "admin" ? <AssayForm sampleId={selectedSample.id} studyId={study.id} /> : null}
                      </div>
                    </WorkspaceSectionCard>
                  ) : (
                    <WorkspaceSectionCard
                      className="h-full"
                      contentClassName="flex h-full flex-col gap-3"
                      description="Select a row in the explorer to review metadata and assay coverage."
                      eyebrow="Detail panel"
                      title="No sample selected"
                    >
                      <p className="text-sm text-muted-foreground">Pick a sample from the table to populate this panel.</p>
                    </WorkspaceSectionCard>
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
