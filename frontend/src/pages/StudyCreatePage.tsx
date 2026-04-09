import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { fetchProject, fetchProjects } from "../api/projects";
import {
  collaborationPath,
  collaborationRegistryPath,
  globalStudyCreateRoute,
} from "../lib/routes";
import { CollaborationPicker } from "../components/CollaborationPicker";
import { StudyForm } from "../components/StudyForm";

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
    queryFn: fetchProjects,
  });

  const query = useQuery({
    queryKey: ["project", selectedProjectId],
    queryFn: () => fetchProject(selectedProjectId as number),
    enabled: selectedProjectId !== null,
  });

  const projects = projectsQuery.data?.results ?? [];
  const hasPinnedCollaboration = Number.isFinite(pathProjectId);

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
          <p className="eyebrow">Study intake</p>
          <h2>Add a study</h2>
        </div>
        <Link className="ghost-link" to={selectedProjectId ? collaborationPath(selectedProjectId) : collaborationRegistryPath}>
          {selectedProjectId ? "Back to collaboration" : "Back to collaborations"}
        </Link>
      </div>

      {!hasPinnedCollaboration ? (
        <CollaborationPicker
          isDisabled={projectsQuery.isLoading}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onProjectChange={handleProjectChange}
        />
      ) : null}

      {projectsQuery.isError ? <p className="error-text">Unable to load collaborations.</p> : null}
      {query.isLoading && selectedProjectId !== null ? <p>Loading collaboration context...</p> : null}
      {query.isError && selectedProjectId !== null ? <p className="error-text">Unable to load this collaboration.</p> : null}

      {query.data ? (
        <>
          <section className="workspace-intro-card">
            <div>
              <strong>Collaboration</strong>
              <p>
                You are adding a study under <strong>{query.data.title}</strong>.
              </p>
            </div>
            <div>
              <strong>When to create a study</strong>
              <p>Create one when the collaboration branches into a distinct experiment, species, cell system, or treatment design.</p>
            </div>
          </section>
          <section className="study-create-layout">
            <StudyForm projectId={query.data.id} projectTitle={query.data.title} />
          </section>
        </>
      ) : selectedProjectId === null ? (
        <section className="workspace-intro-card">
          <div>
            <strong>Choose a collaboration first</strong>
            <p>Select the collaboration record that should own this study before the experiment form appears.</p>
          </div>
          <div>
            <strong>Need a new top-level record?</strong>
            <p>Start with a collaboration when the PI or intake context does not exist yet, then return to {globalStudyCreateRoute}.</p>
          </div>
        </section>
      ) : null}
    </section>
  );
}
