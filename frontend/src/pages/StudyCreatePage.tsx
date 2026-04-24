import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";

import { fetchProject, fetchProjects } from "../api/projects";
import { cn } from "../lib/utils";
import { CollaborationPicker } from "../components/CollaborationPicker";
import { StudyForm } from "../components/StudyForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export function StudyCreatePage() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const pathProjectId = Number(params.projectId);
  const collaborationParam = searchParams.get("collaboration");
  const queryProjectId = collaborationParam ? Number(collaborationParam) : NaN;
  const initialProjectId = Number.isFinite(pathProjectId) ? pathProjectId : Number.isFinite(queryProjectId) ? queryProjectId : null;
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(initialProjectId);

  useEffect(() => {
    setSelectedProjectId(initialProjectId);
  }, [initialProjectId]);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });

  const query = useQuery({
    queryKey: ["project", selectedProjectId],
    queryFn: () => fetchProject(selectedProjectId as number),
    enabled: selectedProjectId !== null,
  });

  const projects = projectsQuery.data?.results ?? [];
  const hasPinnedCollaboration = Number.isFinite(pathProjectId);
  const selectedProject = query.data ?? null;
  const requiresCollaborationSelection = selectedProjectId === null;

  function handleProjectChange(projectId: number) {
    setSelectedProjectId(projectId);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("collaboration", String(projectId));
    setSearchParams(nextSearchParams, { replace: true });
  }

  return (
    <section className="workspace-route">
      <div className="section-header">
        <div>
          <p className="eyebrow">New study onboarding</p>
          <h2>Start a study</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Create a draft study and continue into the wizard for high-level details, template setup, upload, and mappings.
          </p>
        </div>
      </div>

      {projectsQuery.isError ? <p className="error-text">Unable to load collaborations.</p> : null}
      {query.isLoading && selectedProjectId !== null ? <p>Loading collaboration context...</p> : null}
      {query.isError && selectedProjectId !== null ? <p className="error-text">Unable to load this collaboration.</p> : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch">
        <div className={cn("grid gap-6", !hasPinnedCollaboration && "lg:grid-rows-2")}>
          <CollaborationPicker
            className="h-full"
            isDisabled={projectsQuery.isLoading || hasPinnedCollaboration}
            isRequired={requiresCollaborationSelection}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onProjectChange={handleProjectChange}
          />
          <StudyForm className="h-full" isSubmitDisabled={requiresCollaborationSelection} projectId={selectedProject?.id ?? null} />
        </div>
        <Card className="h-full">
          <CardHeader>
            <p className="eyebrow">Reference</p>
            <CardTitle>Definitions</CardTitle>
            <CardDescription>Enter a title on the left to continue. The rest of your study setup, including metadata import, will take place in the onbarding wizard.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1 rounded-lg border border-border/70 bg-muted/30 p-4">
              <strong>Collaboration</strong>
              <p className="text-sm text-muted-foreground">
                {selectedProject ? (
                  <>
                    You are starting a study under <strong>{selectedProject.title}</strong>.
                  </>
                ) : (
                  "Choose a collaboration on the left before launching this study."
                )}
              </p>
            </div>
            <div className="grid gap-1 rounded-lg border border-border/70 bg-muted/30 p-4">
              <strong>Study</strong>
              <p className="text-sm text-muted-foreground">
                A distinct experiment within the collaboration, usually separated by design, species, or cell system.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </section>
  );
}
