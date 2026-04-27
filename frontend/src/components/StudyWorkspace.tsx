import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { AlertTriangle, CheckCircle2, CircleDashed, Download, Ellipsis, FileSpreadsheet, FlaskConical, Plus, Settings2 } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { fetchAssays, type Assay } from "../api/assays";
import { downloadProjectConfig, fetchProject } from "../api/projects";
import { fetchSamples, type Sample } from "../api/samples";
import { fetchStudyExplorerSummary, type StudyExplorerIssue, type SummaryBucket } from "../api/studyExplorer";
import { deleteStudy, downloadStudyGeoMetadataCsv, fetchStudy } from "../api/studies";
import { fetchStudyOnboardingState } from "../api/studyOnboarding";
import { useAuth } from "../auth/AuthProvider";
import { cn } from "../lib/utils";
import { collaborationPath, studiesIndexPath, studyOnboardingPath } from "../lib/routes";
import { clearDeletedStudyClientState } from "../lib/studyDeletion";
import { AssayForm } from "./AssayForm";
import { SampleForm } from "./SampleForm";
import { StudyActionsMenu } from "./StudyActionsMenu";
import { SampleExplorerTable, type SampleExplorerFilters } from "./SampleExplorerTable";
import { SampleUploadPanel } from "./SampleUploadPanel";
import { WorkspaceDetailFieldList } from "./WorkspaceDetailFieldList";
import { WorkspaceSectionCard } from "./WorkspaceSectionCard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Separator } from "./ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";

type StudyWorkspaceView = "overview" | "samples" | "contrasts" | "collaboration";

const workspaceViews: Array<{ key: StudyWorkspaceView; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "samples", label: "Samples" },
  { key: "contrasts", label: "Contrasts" },
  { key: "collaboration", label: "Collaboration" },
];

function parseStudyId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseWorkspaceView(value: string | null): StudyWorkspaceView {
  if (value === "samples" || value === "contrasts" || value === "collaboration") {
    return value;
  }
  return "overview";
}

function getSampleMetadataString(sample: Sample | null, key: string, fallback = "Not provided"): string {
  if (!sample) {
    return fallback;
  }
  const value = sample.metadata?.[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value);
}

function parseSampleFilters(searchParams: URLSearchParams): SampleExplorerFilters {
  const assayStatus = searchParams.get("assay_status");
  const controlFlag = searchParams.get("control_flag");
  return {
    group: searchParams.get("group") ?? undefined,
    dose: searchParams.get("dose") ?? undefined,
    chemical: searchParams.get("chemical") ?? undefined,
    assayStatus: assayStatus === "present" || assayStatus === "missing" ? assayStatus : undefined,
    controlFlag:
      controlFlag === "technical_control" ||
      controlFlag === "reference_rna" ||
      controlFlag === "solvent_control" ||
      controlFlag === "any"
        ? controlFlag
        : undefined,
    missingMetadata: searchParams.get("missing_metadata") ?? undefined,
  };
}

function applySampleFiltersToParams(params: URLSearchParams, filters: SampleExplorerFilters) {
  const mapping: Array<[keyof SampleExplorerFilters, string]> = [
    ["group", "group"],
    ["dose", "dose"],
    ["chemical", "chemical"],
    ["controlFlag", "control_flag"],
    ["assayStatus", "assay_status"],
    ["missingMetadata", "missing_metadata"],
  ];
  for (const [filterKey, paramKey] of mapping) {
    const value = filters[filterKey];
    if (value) {
      params.set(paramKey, value);
    } else {
      params.delete(paramKey);
    }
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Not finalized";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function SummaryTile({
  label,
  value,
  helper,
  status = "neutral",
}: {
  label: string;
  value: string | number;
  helper?: string;
  status?: "ready" | "warning" | "error" | "neutral";
}) {
  return (
    <Card className={cn(status === "error" ? "border-destructive/50" : "", status === "warning" ? "border-amber-300" : "")}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {helper ? <CardContent className="pt-0 text-sm text-muted-foreground">{helper}</CardContent> : null}
    </Card>
  );
}

function BucketList({ buckets, emptyLabel }: { buckets: SummaryBucket[]; emptyLabel: string }) {
  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
  if (buckets.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {buckets.map((bucket) => (
        <div className="flex flex-col gap-1" key={bucket.value}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-foreground">{bucket.value}</span>
            <span className="text-muted-foreground">{bucket.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(8, (bucket.count / maxCount) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function IssueIcon({ severity }: { severity: StudyExplorerIssue["severity"] }) {
  return severity === "error" ? <AlertTriangle data-icon="inline-start" /> : <CircleDashed data-icon="inline-start" />;
}

function formatIssueMessage(message: string): string {
  return message.replace(/assay metadata/gi, "processing metadata");
}

function SampleDetailPanel({
  assays,
  isAdmin,
  sample,
  studyId,
}: {
  assays: Assay[];
  isAdmin: boolean;
  sample: Sample | null;
  studyId: number;
}) {
  const [assayDialogOpen, setAssayDialogOpen] = useState(false);
  const [sampleActionsOpen, setSampleActionsOpen] = useState(false);
  const selectedSampleFields = useMemo(
    () =>
      sample
        ? [
            { label: "Long chemical name", value: getSampleMetadataString(sample, "chemical_longname") },
            { label: "Technical control", value: sample.technical_control ? "Yes" : "No" },
            { label: "Reference RNA", value: sample.reference_rna ? "Yes" : "No" },
            { label: "Solvent control", value: sample.solvent_control ? "Yes" : "No" },
          ]
        : [],
    [sample],
  );

  if (!sample) {
    return (
      <WorkspaceSectionCard
        className="h-full"
        contentClassName="flex h-full flex-col gap-3"
        description="Select a row in the explorer to review metadata and processing details."
        eyebrow="Detail panel"
        title="No sample selected"
      >
        <p className="text-sm text-muted-foreground">Pick a sample from the table to populate this panel.</p>
      </WorkspaceSectionCard>
    );
  }

  return (
    <>
      <WorkspaceSectionCard
        action={
          isAdmin ? (
            <DropdownMenu open={sampleActionsOpen} onOpenChange={setSampleActionsOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Sample actions"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (typeof window !== "undefined" && !("PointerEvent" in window)) {
                      setSampleActionsOpen((current) => !current);
                    }
                  }}
                >
                  <Ellipsis data-icon="inline-start" />
                  More actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setSampleActionsOpen(false);
                      setAssayDialogOpen(true);
                    }}
                  >
                    <Plus data-icon="inline-start" />
                    Apply processing metadata
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
        className="h-full"
        contentClassName="flex h-full flex-col gap-5"
        description="Review the currently selected sample without leaving the explorer."
        eyebrow="Detail panel"
        title="Selected sample"
      >
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">{sample.sample_ID}</p>
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-semibold text-foreground">{sample.sample_name}</h3>
            <CardDescription className="text-sm leading-6">{sample.description || "No description yet."}</CardDescription>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className="rounded-full px-3 py-1 text-sm" variant="secondary">
            Group: {getSampleMetadataString(sample, "group", "—")}
          </Badge>
          <Badge className="rounded-full px-3 py-1 text-sm" variant="secondary">
            Dose: {getSampleMetadataString(sample, "dose", "—")}
          </Badge>
          <Badge className="rounded-full px-3 py-1 text-sm" variant="secondary">
            Chemical: {getSampleMetadataString(sample, "chemical", "None")}
          </Badge>
        </div>

        <WorkspaceDetailFieldList fields={selectedSampleFields} />

        <Separator />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-semibold text-foreground">Processing metadata</h4>
            <p className="text-sm text-muted-foreground">Recorded platform and processing metadata for the selected sample.</p>
          </div>
          {assays.length ? (
            <div className="grid gap-3">
              {assays.map((assay) => (
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
            <p className="text-sm text-muted-foreground">No processing metadata recorded for this sample.</p>
          )}
        </div>
      </WorkspaceSectionCard>

      <Dialog open={assayDialogOpen} onOpenChange={setAssayDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Apply processing metadata</DialogTitle>
            <DialogDescription>
              Record platform, genome, and quantification metadata for {sample.sample_ID}.
            </DialogDescription>
          </DialogHeader>
          <AssayForm onSuccess={() => setAssayDialogOpen(false)} sampleId={sample.id} studyId={studyId} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StudyWorkspace() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const studyId = parseStudyId(params.studyId);
  const activeView = parseWorkspaceView(searchParams.get("view"));
  const intakeOpen = searchParams.get("intake") === "open";
  const sampleFilters = useMemo(() => parseSampleFilters(searchParams), [searchParams]);

  const [sampleSearch, setSampleSearch] = useState("");
  const [samplePagination, setSamplePagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sampleSorting, setSampleSorting] = useState<SortingState>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<number | null>(null);
  const [selectedSampleIds, setSelectedSampleIds] = useState<Set<number>>(() => new Set());
  const [inspectorOpen, setInspectorOpen] = useState(false);

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

  const explorerSummaryQuery = useQuery({
    queryKey: ["study-explorer-summary", studyId],
    queryFn: () => fetchStudyExplorerSummary(studyId as number),
    enabled: studyId !== null,
  });

  const samplesQuery = useQuery({
    queryKey: ["samples", studyId, samplePagination.pageIndex, samplePagination.pageSize, sampleSearch, sampleSorting, sampleFilters],
    queryFn: () =>
      fetchSamples(studyId as number, {
        page: samplePagination.pageIndex + 1,
        pageSize: samplePagination.pageSize,
        search: sampleSearch.trim() ? sampleSearch.trim() : undefined,
        ordering: sampleSorting[0] ? `${sampleSorting[0].desc ? "-" : ""}${sampleSorting[0].id}` : undefined,
        group: sampleFilters.group,
        dose: sampleFilters.dose,
        chemical: sampleFilters.chemical,
        controlFlag: sampleFilters.controlFlag,
        assayStatus: sampleFilters.assayStatus,
        missingMetadata: sampleFilters.missingMetadata,
      }),
    enabled: studyId !== null && activeView === "samples",
  });

  const onboardingStateQuery = useQuery({
    queryKey: ["study-onboarding-state", studyId],
    queryFn: () => fetchStudyOnboardingState(studyId as number),
    enabled: studyId !== null,
  });

  const assaysQuery = useQuery({
    queryKey: ["assays", studyId],
    queryFn: () => fetchAssays(studyId as number),
    enabled: studyId !== null && activeView === "samples",
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

  const geoCsvMutation = useMutation({
    mutationFn: downloadStudyGeoMetadataCsv,
    onSuccess: ({ blob, filename }, studyIdForDownload) => {
      const safeTitle = (studyQuery.data?.title ?? `study_${studyIdForDownload ?? "unknown"}`)
        .toLowerCase()
        .replace(/\s+/g, "_");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename ?? `geo_metadata_${safeTitle}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });

  const deleteStudyMutation = useMutation<void, Error, number>({
    mutationFn: deleteStudy,
    onSuccess: async (_, deletedStudyId) => {
      clearDeletedStudyClientState(queryClient, deletedStudyId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studies"] }),
        queryClient.invalidateQueries({ queryKey: ["studies-index"] }),
        queryClient.invalidateQueries({ queryKey: ["study"] }),
      ]);
      navigate(studiesIndexPath);
    },
  });

  useEffect(() => {
    setSamplePagination((current) => ({ ...current, pageIndex: 0 }));
  }, [sampleSearch, sampleSorting, sampleFilters, studyId]);

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

  function setIntake(nextOpen: boolean) {
    const nextParams = new URLSearchParams(searchParams);
    if (nextOpen) {
      nextParams.set("view", "samples");
      nextParams.set("intake", "open");
    } else {
      nextParams.delete("intake");
    }
    setSearchParams(nextParams, { replace: true });
  }

  function setSampleFilters(nextFilters: SampleExplorerFilters) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", "samples");
    applySampleFiltersToParams(nextParams, nextFilters);
    setSearchParams(nextParams, { replace: true });
  }

  function clearSampleFilters() {
    setSampleFilters({});
  }

  function applyIssueFilter(issue: StudyExplorerIssue) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", "samples");
    applySampleFiltersToParams(nextParams, {
      ...sampleFilters,
      assayStatus: issue.filter.assay_status === "missing" || issue.filter.assay_status === "present" ? issue.filter.assay_status : sampleFilters.assayStatus,
      controlFlag:
        issue.filter.control_flag === "technical_control" ||
        issue.filter.control_flag === "reference_rna" ||
        issue.filter.control_flag === "solvent_control" ||
        issue.filter.control_flag === "any"
          ? issue.filter.control_flag
          : sampleFilters.controlFlag,
      missingMetadata: issue.filter.missing_metadata ?? sampleFilters.missingMetadata,
    });
    setSearchParams(nextParams, { replace: true });
  }

  const study = studyQuery.data;
  const summary = explorerSummaryQuery.data;
  const isAdmin = auth.user?.profile.role === "admin";
  const onboardingPath = study ? studyOnboardingPath(study.id) : "#";
  const finalizePath = study ? `${studyOnboardingPath(study.id)}?step=finalize` : "#";
  const metadataColumns =
    summary?.design_summary.metadata_columns ??
    onboardingStateQuery.data?.metadata_columns ??
    [];

  function viewHref(view: StudyWorkspaceView): string {
    const nextParams = new URLSearchParams(searchParams);
    if (view === "overview") {
      nextParams.delete("view");
      nextParams.delete("intake");
    } else {
      nextParams.set("view", view);
      if (view !== "samples") {
        nextParams.delete("intake");
      }
    }
    const query = nextParams.toString();
    return query ? `?${query}` : ".";
  }

  return (
    <section className="workspace-route">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Study workspace</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="truncate">{study?.title ?? "Study"}</h2>
            {study ? <Badge size="sm" variant={study.status === "active" ? "default" : "secondary"}>{study.status}</Badge> : null}
            {summary ? (
              <Badge
                size="sm"
                className={summary.readiness.status === "error" ? "border-destructive/40 text-destructive" : undefined}
                variant={summary.readiness.status === "error" ? "outline" : summary.readiness.status === "warning" ? "secondary" : "default"}
              >
                {summary.readiness.status === "ready" ? <CheckCircle2 data-icon="inline-start" /> : <AlertTriangle data-icon="inline-start" />}
                {summary.readiness.label}
              </Badge>
            ) : null}
          </div>
          {study ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span>
                {study.species && study.celltype ? `${study.species} · ${study.celltype}` : "Draft metadata pending"}
              </span>
              <span className="mx-2">·</span>
              <Link className="text-primary hover:underline" to={collaborationPath(study.project)}>
                {study.project_title}
              </Link>
              {summary?.config_summary.platform ? <span className="ml-2">· {summary.config_summary.platform}</span> : null}
              {summary?.readiness.updated_at ? <span className="ml-2">· Updated {formatDateTime(summary.readiness.updated_at)}</span> : null}
            </p>
          ) : null}
        </div>

        {study ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setIntake(!intakeOpen)}>
              {intakeOpen ? "Hide sample tools" : "Add samples"}
            </Button>
            {summary?.readiness.status !== "ready" ? (
              <Button asChild type="button" variant="outline">
                <Link to={onboardingPath}>
                  <FileSpreadsheet data-icon="inline-start" />
                  Continue onboarding
                </Link>
              </Button>
            ) : null}
            <StudyActionsMenu
              collaborationId={study.project}
              isDeletingStudy={deleteStudyMutation.isPending}
              onDeleteStudy={deleteStudyMutation.mutate}
              onDownloadConfig={isAdmin ? () => configMutation.mutate(study.project) : undefined}
              onDownloadGeoCsv={() => geoCsvMutation.mutate(study.id)}
              canDownloadGeoCsv={Boolean(summary?.geo_summary?.can_download_csv) && !geoCsvMutation.isPending}
              showOpenStudy={false}
              studyId={study.id}
              studyTitle={study.title}
              triggerClassName="shrink-0"
              triggerLabel="More study actions"
              triggerVariant="outline"
            />
          </div>
        ) : null}
      </div>

      {studyQuery.isLoading ? <p>Loading study workspace...</p> : null}
      {studyQuery.isError ? <p className="error-text">Unable to load this study.</p> : null}
      {explorerSummaryQuery.isError ? <p className="error-text">Unable to load study explorer summary.</p> : null}

      {study ? (
        <div className="mt-5 flex flex-col gap-6">
          <nav className="flex flex-wrap gap-2 rounded-lg border bg-background p-2 text-sm shadow-sm" aria-label="Study workspace views">
            {workspaceViews.map((view) => (
              <Link
                className={cn(
                  "rounded-md px-3 py-2 transition-colors",
                  activeView === view.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                to={viewHref(view.key)}
                key={view.key}
              >
                {view.label}
              </Link>
            ))}
          </nav>

          {activeView === "overview" ? (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <SummaryTile
                  label="Readiness"
                  value={summary?.readiness.status === "ready" ? "Ready" : summary?.readiness.status === "error" ? "Blocked" : summary ? "Review" : "Loading"}
                  helper={summary?.readiness.finalized_at ? `Finalized ${formatDateTime(summary.readiness.finalized_at)}` : "Operational handoff state"}
                  status={summary?.readiness.status ?? "neutral"}
                />
                <SummaryTile label="Samples" value={summary?.sample_summary.total ?? "—"} helper="Biological metadata rows" />
                <SummaryTile
                  label="Processing metadata"
                  value={summary ? `${summary.assay_summary.samples_with_assays}/${summary.sample_summary.total}` : "—"}
                  helper={`${summary?.assay_summary.samples_missing_assays ?? 0} missing processing metadata`}
                  status={summary && summary.assay_summary.samples_missing_assays > 0 ? "warning" : "ready"}
                />
                <SummaryTile label="Contrasts" value={summary?.contrast_summary.selected_count ?? "—"} helper={`${summary?.contrast_summary.suggested_count ?? 0} suggested`} />
                <SummaryTile label="Config" value={summary?.config_summary.can_download_config ? "Ready" : "Review"} helper={summary?.config_summary.sequencing_mode || "Mode pending"} />
              </section>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                <WorkspaceSectionCard
                  contentClassName="grid gap-6 md:grid-cols-3"
                  description="A compact view of the experimental structure that will drive grouping, contrasts, and generated R-ODAF configuration."
                  eyebrow="Design"
                  title="Study design overview"
                >
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-semibold text-foreground">Groups</h3>
                    <BucketList buckets={summary?.design_summary.groups ?? []} emptyLabel="No groups found." />
                  </div>
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-semibold text-foreground">Doses</h3>
                    <BucketList buckets={summary?.design_summary.doses ?? []} emptyLabel="No dose values found." />
                  </div>
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-semibold text-foreground">Chemicals</h3>
                    <BucketList buckets={summary?.design_summary.chemicals ?? []} emptyLabel="No chemical values found." />
                  </div>
                </WorkspaceSectionCard>

                <WorkspaceSectionCard
                  contentClassName="flex flex-col gap-3"
                  description="Issues that can change whether the generated handoff is complete."
                  eyebrow="Review"
                  title="Attention queue"
                >
                  {summary?.blocking_issues.length ? (
                    summary.blocking_issues.map((issue) => (
                      <article className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3" key={`${issue.code}-${issue.message}`}>
                        <div className="flex min-w-0 gap-2">
                          <span className={issue.severity === "error" ? "text-destructive" : "text-muted-foreground"}>
                            <IssueIcon severity={issue.severity} />
                          </span>
                          <div className="flex min-w-0 flex-col gap-1">
                            <p className="text-sm font-medium text-foreground">{formatIssueMessage(issue.message)}</p>
                            <p className="text-xs text-muted-foreground">{issue.severity === "error" ? "Blocking" : "Warning"}</p>
                          </div>
                        </div>
                        {Object.keys(issue.filter).length > 0 ? (
                          <Button size="sm" type="button" variant="outline" onClick={() => applyIssueFilter(issue)}>
                            {formatIssueMessage(issue.action_label)}
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <Link to={finalizePath}>{issue.action_label}</Link>
                          </Button>
                        )}
                      </article>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No operational issues found.</p>
                  )}
                </WorkspaceSectionCard>
              </div>

              <WorkspaceSectionCard
                action={
                  <Button
                    disabled={!summary?.geo_summary?.can_download_csv || geoCsvMutation.isPending}
                    type="button"
                    variant="outline"
                    onClick={() => geoCsvMutation.mutate(study.id)}
                  >
                    <FileSpreadsheet data-icon="inline-start" />
                    Download GEO CSV
                  </Button>
                }
                contentClassName="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,auto)] md:items-center"
                description="Pre-populated required GEO metadata columns for collaborator review and manual completion."
                eyebrow="GEO"
                title="GEO submission helper"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={summary?.geo_summary?.can_download_csv ? "secondary" : "outline"}>
                      {summary?.geo_summary?.can_download_csv ? "Ready with blanks" : "Needs samples"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Known fields: {summary?.geo_summary?.populated_field_count ?? 0}/{summary?.geo_summary?.total_field_count ?? 24} populated
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Manual fields remaining: {summary?.geo_summary?.manual_field_labels.join(", ") || "Review all GEO fields before submission"}
                  </p>
                </div>
              </WorkspaceSectionCard>
            </>
          ) : null}

          {deleteStudyMutation.isError ? <p className="error-text">{deleteStudyMutation.error.message}</p> : null}
          {activeView === "samples" && intakeOpen ? (
            <WorkspaceSectionCard
              action={
                <Button type="button" variant="ghost" onClick={() => setIntake(false)}>
                  Close
                </Button>
              }
              contentClassName="grid gap-6 lg:grid-cols-2"
              description="Add samples one-by-one or upload a sheet for bulk intake. These tools stay inline so scientists can compare new rows against the explorer."
              eyebrow="Onboarding"
              title="Sample metadata onboarding"
            >
              <div className="contents">
                <SampleForm studyId={study.id} />
                <SampleUploadPanel studyId={study.id} />
              </div>
            </WorkspaceSectionCard>
          ) : null}

          {activeView === "samples" ? (
            <section className="grid gap-4">
              {samplesQuery.isError ? <p className="error-text">Unable to load samples.</p> : null}
              {assaysQuery.isError ? <p className="error-text">Unable to load processing metadata.</p> : null}
              <SampleExplorerTable
              samples={samplesQuery.data?.results ?? []}
              totalCount={samplesQuery.data?.count ?? 0}
              isLoading={samplesQuery.isLoading}
              pagination={samplePagination}
              sorting={sampleSorting}
              search={sampleSearch}
              selectedSampleId={selectedSampleId}
              selectedSampleIds={selectedSampleIds}
              filters={sampleFilters}
              metadataColumns={metadataColumns}
              onPaginationChange={setSamplePagination}
              onSortingChange={setSampleSorting}
              onSearchChange={setSampleSearch}
              onFilterChange={setSampleFilters}
              onClearFilters={clearSampleFilters}
              onSelectSample={(sample) => {
                setSelectedSampleId(sample.id);
                setInspectorOpen(true);
              }}
              onToggleSampleSelection={(sampleId, selected) =>
                setSelectedSampleIds((current) => {
                  const next = new Set(current);
                  if (selected) {
                    next.add(sampleId);
                  } else {
                    next.delete(sampleId);
                  }
                  return next;
                })
              }
              onTogglePageSelection={(selected, sampleIds) =>
                setSelectedSampleIds((current) => {
                  const next = new Set(current);
                  for (const sampleId of sampleIds) {
                    if (selected) {
                      next.add(sampleId);
                    } else {
                      next.delete(sampleId);
                    }
                  }
                  return next;
                })
              }
              />
            </section>
          ) : null}

          {activeView === "contrasts" ? (
            <>
              <WorkspaceSectionCard
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild type="button" variant="outline">
                  <Link to={finalizePath}>
                    <Settings2 data-icon="inline-start" />
                    Review contrasts
                  </Link>
                </Button>
                {isAdmin ? (
                  <Button
                    disabled={!summary?.config_summary.can_download_config || configMutation.isPending}
                    type="button"
                    onClick={() => configMutation.mutate(study.project)}
                  >
                    <Download data-icon="inline-start" />
                    Download config
                  </Button>
                ) : null}
              </div>
            }
            contentClassName="grid gap-6 lg:grid-cols-2"
            description="Selected contrasts and config essentials that will become the handoff bundle."
            eyebrow="Handoff"
            title="Contrasts and config handoff"
            className="scroll-mt-4"
            >
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Selected contrasts</h3>
              {summary?.contrast_summary.selected.length ? (
                <div className="flex flex-col gap-2">
                  {summary.contrast_summary.selected.map((pair) => (
                    <Badge className="w-fit" key={`${pair.reference_group}:${pair.comparison_group}`} variant="secondary">
                      {pair.comparison_group} vs {pair.reference_group}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No contrasts selected yet.</p>
              )}
              <p className="text-sm text-muted-foreground">{summary?.contrast_summary.suggested_count ?? 0} suggested contrast(s) available from onboarding.</p>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Config essentials</h3>
              <WorkspaceDetailFieldList
                fields={[
                  ["Platform", summary?.config_summary.platform ?? "—"],
                  ["Sequencing mode", summary?.config_summary.sequencing_mode ?? "—"],
                  ["Instrument model", summary?.config_summary.instrument_model || "—"],
                  ["Sequenced by", summary?.config_summary.sequenced_by || "—"],
                  ["Biospyder kit", summary?.config_summary.biospyder_kit || "—"],
                ].map(([label, value]) => ({ label, value }))}
              />
            </div>
            </WorkspaceSectionCard>
            </>
          ) : null}

          {activeView === "collaboration" ? (
            <WorkspaceSectionCard
            action={
              <Button asChild size="sm" variant="outline">
                <Link to={collaborationPath(study.project)}>
                  <FlaskConical data-icon="inline-start" />
                  Open collaboration
                </Link>
              </Button>
            }
            contentClassName="flex flex-col gap-3"
            description="Parent collaboration details for ownership and routing."
            eyebrow="Context"
            title="Collaboration context"
            className="scroll-mt-4"
            >
            <div>
              <p className="text-sm font-semibold text-foreground">{projectQuery.data?.title ?? study.project_title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                PI {projectQuery.data?.pi_name ?? "Unknown"}
                {projectQuery.data?.owner ? ` · Owner: ${projectQuery.data.owner}` : ""}
              </p>
              {projectQuery.data?.description ? <p className="mt-2 text-sm text-muted-foreground">{projectQuery.data.description}</p> : null}
            </div>
            </WorkspaceSectionCard>
          ) : null}

          <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
              <SheetHeader>
                <SheetTitle>Sample inspector</SheetTitle>
                <SheetDescription>Full metadata and processing details for the selected sample.</SheetDescription>
              </SheetHeader>
              <div className="mt-6">
                <SampleDetailPanel
                  assays={selectedSample ? assaysBySample[selectedSample.id] ?? [] : []}
                  isAdmin={Boolean(isAdmin)}
                  sample={selectedSample}
                  studyId={study.id}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      ) : null}
    </section>
  );
}
