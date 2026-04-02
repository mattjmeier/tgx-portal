import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { fetchProject } from "../api/projects";
import { ProjectWorkspace } from "../components/ProjectWorkspace";

export function ProjectWorkspacePage() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = Number(params.projectId);
  const selectedStudyIdParam = searchParams.get("study");
  const initialStudyId = selectedStudyIdParam ? Number(selectedStudyIdParam) : undefined;

  const query = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject(projectId),
    enabled: Number.isFinite(projectId),
  });

  return (
    <section className="workspace-route">
      <div className="section-header">
        <div>
          <p className="eyebrow">Project workspace</p>
          <h2>Focused project management</h2>
        </div>
        <Link className="ghost-link" to="/projects">
          Back to projects
        </Link>
      </div>

      {query.isLoading ? <p>Loading project workspace...</p> : null}
      {query.isError ? <p className="error-text">Unable to load this project.</p> : null}
      <section className="workspace-intro-card">
        <div>
          <strong>Project view</strong>
          <p>This page focuses on one collaboration at a time so the experiment hierarchy is easier to manage.</p>
        </div>
        <div>
          <strong>When to add a study</strong>
          <p>Create a new study when the project contains a distinct experiment with its own species, cell type, or treatment structure.</p>
        </div>
      </section>

      {query.data ? (
        <ProjectWorkspace
          initialProjectId={query.data.id}
          initialStudyId={Number.isFinite(initialStudyId) ? initialStudyId : undefined}
          projects={[query.data]}
          showProjectSelector={false}
          onStudyChange={(studyId) => {
            const nextSearchParams = new URLSearchParams(searchParams);
            if (studyId) {
              nextSearchParams.set("study", String(studyId));
            } else {
              nextSearchParams.delete("study");
            }
            setSearchParams(nextSearchParams, { replace: true });
          }}
        />
      ) : null}
    </section>
  );
}
