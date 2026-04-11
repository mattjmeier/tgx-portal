import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import type { Project } from "../api/projects";
import { deleteStudy, fetchStudies } from "../api/studies";
import { collaborationStudyCreatePath, studyWorkspacePath } from "../lib/routes";
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
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(initialProjectId ?? projects[0]?.id ?? null);

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["studies", selectedProjectId] });
    },
  });

  function handleProjectSelect(projectId: number) {
    setSelectedProjectId(projectId);
  }

  const collaborationSampleCount = studies.reduce((total, study) => total + (study.sample_count ?? 0), 0);
  const collaborationAssayCount = studies.reduce((total, study) => total + (study.assay_count ?? 0), 0);

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
                      <CardDescription className="workspace-stat-label">Assays in collaboration</CardDescription>
                      <CardTitle className="text-4xl">{collaborationAssayCount}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-sm text-muted-foreground">
                      {studies.length > 0 ? "Total assay coverage recorded across all studies in this collaboration." : "Assay totals will appear after samples are added."}
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
                  <p className="workspace-study-directory-copy">Select one to explore samples and assays for that experiment.</p>
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
                      <Link aria-label={`Edit study ${study.title}`} to={`${studyWorkspacePath(study.id)}?tab=collaboration`}>
                        <Pencil />
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
                  </div>
                )}
              />
                {deleteStudyMutation.isError ? <p className="error-text">{deleteStudyMutation.error.message}</p> : null}
              </CardContent>
            </Card>
          </div>
          </div>
        </div>
      )}
    </section>
  );
}
