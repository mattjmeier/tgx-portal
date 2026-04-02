import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { fetchProject } from "../api/projects";
import { StudyForm } from "../components/StudyForm";

export function StudyCreatePage() {
  const params = useParams();
  const projectId = Number(params.projectId);

  const query = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject(projectId),
    enabled: Number.isFinite(projectId),
  });

  return (
    <section className="workspace-route">
      <div className="section-header">
        <div>
          <p className="eyebrow">Study intake</p>
          <h2>Create a new study</h2>
        </div>
        <Link className="ghost-link" to={`/projects/${projectId}`}>
          Back to workspace
        </Link>
      </div>

      {query.isLoading ? <p>Loading project context...</p> : null}
      {query.isError ? <p className="error-text">Unable to load this project.</p> : null}

      {query.data ? (
        <>
          <section className="workspace-intro-card">
            <div>
              <strong>Project</strong>
              <p>
                You are adding a study under <strong>{query.data.title}</strong>.
              </p>
            </div>
            <div>
              <strong>When to create a study</strong>
              <p>Create one when the project branches into a distinct experiment, species, cell system, or treatment design.</p>
            </div>
          </section>
          <section className="study-create-layout">
            <StudyForm projectId={query.data.id} />
          </section>
        </>
      ) : null}
    </section>
  );
}
