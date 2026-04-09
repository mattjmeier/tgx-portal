import { useParams, useSearchParams } from "react-router-dom";
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
      {query.isLoading ? <p>Loading collaboration workspace...</p> : null}
      {query.isError ? <p className="error-text">Unable to load this collaboration.</p> : null}

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
