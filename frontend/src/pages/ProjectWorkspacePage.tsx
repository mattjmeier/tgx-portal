import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { fetchProject } from "../api/projects";
import { ProjectWorkspace } from "../components/ProjectWorkspace";

export function ProjectWorkspacePage() {
  const params = useParams();
  const projectId = Number(params.projectId);

  const query = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject(projectId),
    enabled: Number.isFinite(projectId),
  });

  return (
    <section className="workspace-route">
      {query.isLoading ? <p>Loading collaboration workspace...</p> : null}
      {query.isError ? <p className="error-text">Unable to load this collaboration.</p> : null}

      {query.data ? (
        <ProjectWorkspace
          initialProjectId={query.data.id}
          projects={[query.data]}
          showProjectSelector={false}
        />
      ) : null}
    </section>
  );
}
