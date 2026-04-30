import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import type { Project } from "../api/projects";
import { deleteStudy, fetchStudies, syncStudyToPlane } from "../api/studies";
import { useAuth } from "../auth/AuthProvider";
import { collaborationStudyCreatePath, studyOnboardingPath, studyWorkspacePath } from "../lib/routes";
import { clearDeletedStudyClientState } from "../lib/studyDeletion";
import { StudyActionsMenu } from "./StudyActionsMenu";
import { StudyDeleteDialog } from "./StudyDeleteDialog";
import { StudiesTable } from "./StudiesTable";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

type ProjectWorkspaceProps = {
  projects: Project[];
  initialProjectId?: number;
  showProjectSelector?: boolean;
};

export function ProjectWorkspace({
  projects,
  initialProjectId,
  showProjectSelector = true,
}: ProjectWorkspaceProps) {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(initialProjectId ?? projects[0]?.id ?? null);
  const isAdmin = auth.user?.profile.role === "admin";

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

  const deleteStudyMutation = useMutation<void, Error, number>({
    mutationFn: deleteStudy,
    onSuccess: async (_, deletedStudyId) => {
      clearDeletedStudyClientState(queryClient, deletedStudyId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studies", selectedProjectId] }),
        queryClient.invalidateQueries({ queryKey: ["studies-index"] }),
      ]);
    },
  });

  const planeSyncMutation = useMutation({
    mutationFn: syncStudyToPlane,
    onSuccess: async (_, syncedStudyId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["study", syncedStudyId] }),
        queryClient.invalidateQueries({ queryKey: ["studies"] }),
        queryClient.invalidateQueries({ queryKey: ["studies-index"] }),
      ]);
    },
  });

  function handleProjectSelect(projectId: number) {
    setSelectedProjectId(projectId);
  }

  const collaborationSampleCount = studies.reduce((total, study) => total + (study.sample_count ?? 0), 0);
  const collaborationProcessingMetadataCount = studies.reduce((total, study) => total + (study.assay_count ?? 0), 0);

  return (
    <section className="workspace-panel workspace-panel-flat">
      {projects.length === 0 ? (
        <article className="empty-card">
          <h3>No collaboration selected yet</h3>
          <p>Create a collaboration above to unlock study and sample intake.</p>
        </article>
      ) : (
        <div className="workspace-stack">
          {selectedProject ? (
            <Card className="workspace-summary-card" id="project-setup">
              <CardHeader className="workspace-summary-header">
                <div className="workspace-summary-copy">
                  <p className="eyebrow">Collaboration record</p>
                  <CardTitle className="text-3xl">{selectedProject.title}</CardTitle>
                  <CardDescription className="text-base">
                    PI: {selectedProject.pi_name}
                    {selectedProject.owner ? ` · Owner: ${selectedProject.owner}` : ""}
                  </CardDescription>
                </div>
                <div className="workspace-summary-actions">
                  <Button asChild>
                    <Link to={collaborationStudyCreatePath(selectedProject.id)}>Add study</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="workspace-summary-content">
                <p className="text-sm leading-6 text-muted-foreground">
                  {selectedProject.description ||
                    "Use this collaboration workspace to move from high-level intake into experiment setup, sample registration, and assay tracking for downstream pipeline generation."}
                </p>
                <div className="workspace-summary-stats">
                  <Card className="bg-muted/30 shadow-none">
                    <CardHeader className="gap-2 p-4">
                      <CardDescription className="workspace-stat-label">Studies</CardDescription>
                      <CardTitle className="text-4xl">{studies.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-sm text-muted-foreground">
                      {selectedProject.owner ? `Owned by ${selectedProject.owner}` : "No client owner assigned yet."}
                    </CardContent>
                  </Card>
                  <Card className="bg-muted/30 shadow-none">
                    <CardHeader className="gap-2 p-4">
                      <CardDescription className="workspace-stat-label">Samples in collaboration</CardDescription>
                      <CardTitle className="text-4xl">{collaborationSampleCount}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-sm text-muted-foreground">
                      {studies.length > 0 ? "Total registered samples across every study in this collaboration." : "Add a study to start registering samples."}
                    </CardContent>
                  </Card>
                  <Card className="bg-muted/30 shadow-none">
                    <CardHeader className="gap-2 p-4">
                      <CardDescription className="workspace-stat-label">Assay setup rows</CardDescription>
                      <CardTitle className="text-4xl">{collaborationProcessingMetadataCount}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-sm text-muted-foreground">
                      {studies.length > 0 ? "Sample-level assay setup recorded across all studies in this collaboration." : "Assay setup totals will appear after samples are added."}
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
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
            <Card className="workspace-study-directory-card" id="study-directory">
              <CardHeader className="workspace-study-directory-card-header">
                <div className="workspace-study-directory-header">
                  <h3 className="workspace-study-directory-title">Studies in this collaboration</h3>
                  <p className="workspace-study-directory-copy">Select one to explore samples and assay setup for that experiment.</p>
                </div>
              </CardHeader>
              <CardContent className="workspace-study-directory-card-content">
                <StudiesTable
                  className="mt-0"
                studies={studies}
                isLoading={studiesQuery.isLoading}
                isError={studiesQuery.isError}
                emptyMessage="No studies yet. Create the first study for this collaboration to continue to sample intake."
                renderStudyTitle={(study) => (
                  <div className="flex min-w-0 flex-col">
                    <Link className="truncate font-medium text-primary hover:underline" to={studyWorkspacePath(study.id)}>
                      {study.title}
                    </Link>
                    <span className="truncate text-sm text-muted-foreground">
                      {study.species && study.celltype ? `${study.species} · ${study.celltype}` : "Draft metadata pending"}
                    </span>
                  </div>
                )}
                renderStudyActions={(study) => (
                  <div className="flex items-center gap-2">
                    <Button asChild size="icon" variant="outline">
                      <Link
                        aria-label={
                          study.status === "draft"
                            ? `Continue onboarding for study ${study.title}`
                            : `Review onboarding for study ${study.title}`
                        }
                        to={studyOnboardingPath(study.id)}
                      >
                        {study.status === "draft" ? <ArrowRight /> : <Pencil />}
                      </Link>
                    </Button>
                    <StudyDeleteDialog
                      isDeleting={deleteStudyMutation.isPending && deleteStudyMutation.variables === study.id}
                      studyId={study.id}
                      studyTitle={study.title}
                      onConfirmDelete={deleteStudyMutation.mutate}
                    >
                      <Button aria-label={`Delete study ${study.title}`} size="icon" type="button" variant="destructive">
                        <Trash2 />
                      </Button>
                    </StudyDeleteDialog>
                    <StudyActionsMenu
                      collaborationId={study.project}
                      isSyncingToPlane={planeSyncMutation.isPending && planeSyncMutation.variables === study.id}
                      onSyncToPlane={isAdmin ? planeSyncMutation.mutate : undefined}
                      canSyncToPlane={isAdmin && study.status === "active"}
                      planeSync={study.plane_sync}
                      showOpenStudy={false}
                      studyId={study.id}
                      studyTitle={study.title}
                      triggerClassName="shrink-0"
                      triggerLabel={`More actions for study ${study.title}`}
                      triggerVariant="outline"
                    />
                  </div>
                )}
              />
                {deleteStudyMutation.isError ? <p className="error-text">{deleteStudyMutation.error.message}</p> : null}
                {planeSyncMutation.isError ? <p className="error-text">{planeSyncMutation.error.message}</p> : null}
              </CardContent>
            </Card>
          </div>
          </div>
        </div>
      )}
    </section>
  );
}
