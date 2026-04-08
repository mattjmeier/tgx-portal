import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { deleteAssay, fetchAssays, type Assay } from "../api/assays";
import { downloadProjectConfig, type Project } from "../api/projects";
import { deleteSample, fetchSamples } from "../api/samples";
import { deleteStudy, fetchStudies, type Study } from "../api/studies";
import { collaborationStudyCreatePath } from "../lib/routes";
import { AssayForm } from "./AssayForm";
import { SampleForm } from "./SampleForm";
import { SampleExplorerTable } from "./SampleExplorerTable";
import { SampleUploadPanel } from "./SampleUploadPanel";

type ProjectWorkspaceProps = {
  projects: Project[];
  initialProjectId?: number;
  initialStudyId?: number;
  showProjectSelector?: boolean;
  onStudyChange?: (studyId: number | null) => void;
};

export function ProjectWorkspace({
  projects,
  initialProjectId,
  initialStudyId,
  showProjectSelector = true,
  onStudyChange,
}: ProjectWorkspaceProps) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(initialProjectId ?? projects[0]?.id ?? null);
  const [selectedStudyId, setSelectedStudyId] = useState<number | null>(initialStudyId ?? null);
  const [selectedSampleId, setSelectedSampleId] = useState<number | null>(null);
  const [sampleSearch, setSampleSearch] = useState("");
  const [samplePagination, setSamplePagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 5,
  });
  const [sampleSorting, setSampleSorting] = useState<SortingState>([]);

  useEffect(() => {
    const selectedProjectStillExists = projects.some((project) => project.id === selectedProjectId);
    if (initialProjectId && projects.some((project) => project.id === initialProjectId)) {
      setSelectedProjectId(initialProjectId);
      return;
    }

    if (projects.length > 0 && (selectedProjectId === null || !selectedProjectStillExists)) {
      setSelectedProjectId(projects[0].id);
    }
  }, [initialProjectId, projects, selectedProjectId]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  const studiesQuery = useQuery({
    queryKey: ["studies", selectedProjectId],
    queryFn: () => fetchStudies(selectedProjectId as number),
    enabled: selectedProjectId !== null,
  });

  const studies = studiesQuery.data?.results ?? [];

  useEffect(() => {
    if (initialStudyId === undefined) {
      return;
    }

    if (studies.some((study) => study.id === initialStudyId)) {
      setSelectedStudyId(initialStudyId);
    }
  }, [initialStudyId, studies]);

  useEffect(() => {
    if (selectedStudyId !== null && !studies.some((study) => study.id === selectedStudyId)) {
      setSelectedStudyId(null);
      onStudyChange?.(null);
    }
  }, [onStudyChange, selectedStudyId, studies]);

  const selectedStudy = studies.find((study) => study.id === selectedStudyId) ?? null;

  const samplesQuery = useQuery({
    queryKey: ["samples", selectedStudyId, samplePagination.pageIndex, samplePagination.pageSize, sampleSearch, sampleSorting],
    queryFn: () =>
      fetchSamples(selectedStudyId as number, {
        page: samplePagination.pageIndex + 1,
        pageSize: samplePagination.pageSize,
        search: sampleSearch,
        ordering: sampleSorting[0]
          ? `${sampleSorting[0].desc ? "-" : ""}${sampleSorting[0].id}`
          : undefined,
      }),
    enabled: selectedStudyId !== null,
  });
  const assaysQuery = useQuery({
    queryKey: ["assays", selectedStudyId],
    queryFn: () => fetchAssays(selectedStudyId as number),
    enabled: selectedStudyId !== null,
  });

  useEffect(() => {
    setSamplePagination((current) => ({ ...current, pageIndex: 0 }));
  }, [sampleSearch, sampleSorting, selectedStudyId]);

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

  const deleteStudyMutation = useMutation<void, Error, number>({
    mutationFn: deleteStudy,
    onSuccess: async () => {
      setSelectedStudyId(null);
      await queryClient.invalidateQueries({ queryKey: ["studies", selectedProjectId] });
    },
  });

  const deleteSampleMutation = useMutation<void, Error, number>({
    mutationFn: deleteSample,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["samples", selectedStudyId] });
      await queryClient.invalidateQueries({ queryKey: ["assays", selectedStudyId] });
    },
  });

  const deleteAssayMutation = useMutation<void, Error, number>({
    mutationFn: deleteAssay,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assays", selectedStudyId] });
    },
  });

  const configMutation = useMutation<Blob, Error, number>({
    mutationFn: downloadProjectConfig,
    onSuccess: (blob, projectId) => {
      const project = projects.find((item) => item.id === projectId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `config_bundle_${project?.title.toLowerCase().replace(/\s+/g, "_") ?? projectId}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });

  function handleProjectSelect(projectId: number) {
    setSelectedProjectId(projectId);
    setSelectedStudyId(null);
    setSelectedSampleId(null);
    onStudyChange?.(null);
  }

  function handleStudySelect(study: Study) {
    setSelectedStudyId(study.id);
    setSelectedSampleId(null);
    onStudyChange?.(study.id);
  }

  function handleDeleteStudy(study: Study) {
    const confirmed = window.confirm(`Delete this study for ${study.celltype} (${study.species})?`);
    if (!confirmed) {
      return;
    }

    deleteStudyMutation.mutate(study.id);
  }

  function handleDeleteSample(sampleId: number, sampleName: string) {
    const confirmed = window.confirm(`Delete sample "${sampleName}"?`);
    if (!confirmed) {
      return;
    }

    deleteSampleMutation.mutate(sampleId);
  }

  function handleDeleteAssay(assayId: number) {
    const confirmed = window.confirm("Delete this assay?");
    if (!confirmed) {
      return;
    }

    deleteAssayMutation.mutate(assayId);
  }

  function handleDownloadConfig(projectId: number) {
    configMutation.mutate(projectId);
  }

  const assaysBySample = (assaysQuery.data?.results ?? []).reduce<Record<number, Assay[]>>((accumulator, assay) => {
    accumulator[assay.sample] = [...(accumulator[assay.sample] ?? []), assay];
    return accumulator;
  }, {});
  const selectedSample = (samplesQuery.data?.results ?? []).find((sample) => sample.id === selectedSampleId) ?? null;
  const sampleCount = samplesQuery.data?.count ?? 0;
  const assayCountForSelectedSample = selectedSample ? assaysBySample[selectedSample.id]?.length ?? 0 : 0;

  return (
    <section className="workspace-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>Studies and samples</h2>
        </div>
      </div>

      {projects.length === 0 ? (
        <article className="empty-card">
          <h3>No collaboration selected yet</h3>
          <p>Create a collaboration above to unlock study and sample intake.</p>
        </article>
      ) : (
        <div className="workspace-stack">
          {selectedProject ? (
            <section className="workspace-overview" id="project-setup">
              <div className="workspace-overview-copy">
                <p className="eyebrow">Overview</p>
                <h3>{selectedProject.title}</h3>
                <p className="workspace-overview-meta">
                  PI: {selectedProject.pi_name}
                  {selectedProject.owner ? ` · Owner: ${selectedProject.owner}` : ""}
                </p>
                <p className="body-copy">
                  {selectedProject.description || "Use this workspace to move from collaboration-level setup into experiment-level intake, then into sample and assay records for downstream pipeline generation."}
                </p>
                <div className="workspace-overview-actions">
                  <Link className="primary-button" to={collaborationStudyCreatePath(selectedProject.id)}>
                    Add study
                  </Link>
                  {auth.user?.profile.role === "admin" ? (
                    <button className="secondary-button overview-secondary-button" type="button" onClick={() => handleDownloadConfig(selectedProject.id)}>
                      {configMutation.isPending ? "Preparing bundle..." : "Download config bundle"}
                    </button>
                  ) : (
                    <span className="workspace-overview-note">Config bundle export is currently limited to admin users.</span>
                  )}
                </div>
                {configMutation.isError ? <p className="error-text">{configMutation.error.message}</p> : null}
              </div>
              <div className="workspace-stat-grid">
                <article className="workspace-stat-card">
                  <span className="workspace-stat-label">Studies</span>
                  <strong>{studies.length}</strong>
                  <p>{selectedProject.owner ? `Owned by ${selectedProject.owner}` : "No client owner assigned yet."}</p>
                </article>
                <article className="workspace-stat-card">
                  <span className="workspace-stat-label">Samples in current study</span>
                  <strong>{selectedStudy ? sampleCount : 0}</strong>
                  <p>{selectedStudy ? `${selectedStudy.species} / ${selectedStudy.celltype}` : "Select a study to explore its sample table."}</p>
                </article>
                <article className="workspace-stat-card">
                  <span className="workspace-stat-label">Assays on selected sample</span>
                  <strong>{assayCountForSelectedSample}</strong>
                  <p>{selectedSample ? selectedSample.sample_ID : "Choose a sample row to review assay coverage."}</p>
                </article>
              </div>
            </section>
          ) : null}

          <div className={showProjectSelector ? "workspace-grid" : "workspace-grid workspace-grid-single"}>
          {showProjectSelector ? (
          <div className="workspace-column">
              <div className="selector-group">
                <h3>Select a collaboration</h3>
                <div className="chip-row">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      className={project.id === selectedProjectId ? "chip chip-active" : "chip"}
                      type="button"
                      onClick={() => handleProjectSelect(project.id)}
                    >
                      {project.title}
                    </button>
                  ))}
                </div>
              </div>
          </div>
          ) : null}

          <div className="workspace-column">
            <div className="selector-group" id="study-directory">
              <div className="section-header compact-header">
                <div>
                  <h3>Studies for the selected collaboration</h3>
                  <p className="muted-copy">Select one to explore samples and assays for that experiment.</p>
                </div>
                {selectedProject ? (
                  <Link className="secondary-button" to={collaborationStudyCreatePath(selectedProject.id)}>
                    New study
                  </Link>
                ) : null}
              </div>
              {studiesQuery.isLoading ? <p>Loading studies...</p> : null}
              {studiesQuery.isError ? <p className="error-text">Unable to load studies.</p> : null}
              <div className="study-list">
                {studies.length === 0 ? (
                  <article className="empty-card">
                    <h3>No studies yet</h3>
                    <p>Create the first study for this collaboration to continue to sample intake.</p>
                  </article>
                ) : (
                  studies.map((study) => (
                    <article className={study.id === selectedStudyId ? "study-card study-card-active" : "study-card"} key={study.id}>
                      <button className="study-select-button" type="button" onClick={() => handleStudySelect(study)}>
                        <strong>{study.species}</strong>
                        <span>{study.celltype}</span>
                        <span>Treatment: {study.treatment_var}</span>
                        <span>Batch: {study.batch_var}</span>
                      </button>
                      <div className="card-actions">
                        <button className="danger-button" type="button" onClick={() => handleDeleteStudy(study)}>
                          Delete study
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
              {deleteStudyMutation.isError ? <p className="error-text">{deleteStudyMutation.error.message}</p> : null}
            </div>

            {selectedStudy ? (
              <>
                <section className="workspace-subgrid">
                  <div className="workspace-subgrid-main">
                    <section className="intake-stack" id="sample-intake">
                      <SampleForm studyId={selectedStudy.id} />
                      <SampleUploadPanel studyId={selectedStudy.id} />
                    </section>
                    <section id="sample-explorer">
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
                    </section>
                  </div>

                  <aside className="sample-detail-rail" id="sample-detail">
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
                                  <button className="danger-button" type="button" onClick={() => handleDeleteAssay(assay.id)}>
                                    Delete assay
                                  </button>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <p className="muted-copy">No assays yet for this sample.</p>
                          )}
                          <AssayForm sampleId={selectedSample.id} studyId={selectedStudy.id} />
                        </div>
                        <div className="card-actions">
                          <button className="danger-button" type="button" onClick={() => handleDeleteSample(selectedSample.id, selectedSample.sample_name)}>
                            Delete sample
                          </button>
                        </div>
                      </article>
                    ) : (
                      <article className="empty-card detail-empty-card">
                        <h3>No sample selected</h3>
                        <p>Select a row in the explorer to review metadata, manage assays, and remove records when needed.</p>
                      </article>
                    )}
                    {deleteSampleMutation.isError ? <p className="error-text">{deleteSampleMutation.error.message}</p> : null}
                    {deleteAssayMutation.isError ? <p className="error-text">{deleteAssayMutation.error.message}</p> : null}
                  </aside>
                </section>
              </>
            ) : studies.length > 0 ? (
              <article className="empty-card">
                <h3>Select a study</h3>
                <p>Choose one of the studies to start adding samples.</p>
              </article>
            ) : null}
          </div>
          </div>
        </div>
      )}
    </section>
  );
}
