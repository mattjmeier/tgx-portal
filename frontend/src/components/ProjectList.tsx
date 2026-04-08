import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { deleteProject, fetchProjects, type Project } from "../api/projects";
import { collaborationCreatePath, collaborationPath, globalStudyCreateRoute } from "../lib/routes";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

type ProjectListProps = {
  onProjectsLoaded?: (projects: Project[]) => void;
};

export function ProjectList({ onProjectsLoaded }: ProjectListProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });
  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: deleteProject,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  if (query.data && onProjectsLoaded) {
    onProjectsLoaded(query.data.results);
  }

  function handleDeleteProject(project: Project) {
    const confirmed = window.confirm(`Delete collaboration "${project.title}" and all of its studies and samples?`);
    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(project.id);
  }

  return (
    <>
      <section className="project-list-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Collaborations</p>
            <h2>Collaboration catalog</h2>
          </div>
        </div>

        <div className="registry-toolbar">
          <div className="registry-toolbar-copy">
            <p className="muted-copy">
              Browse current collaborations first. Use the quick actions here only when you need to start a new collaboration or add a study.
            </p>
          </div>
          <div className="registry-toolbar-actions">
            <Link className="secondary-button" to={collaborationCreatePath}>
              New collaboration
            </Link>
            <Link className="secondary-button" to={globalStudyCreateRoute}>
              New study
            </Link>
            <a className="ghost-link" href={`${apiBaseUrl}/api/health/`} target="_blank" rel="noreferrer">
              API health
            </a>
          </div>
        </div>

        {query.isLoading ? <p>Loading projects...</p> : null}
        {query.isError ? <p className="error-text">The project list could not be loaded.</p> : null}

        {query.data ? (
          <>
            <p className="muted-copy">
              Showing {query.data.results.length} of {query.data.count} collaboration records. Open a workspace to manage studies, samples, assays, and configuration output.
            </p>
            <div className="table-shell">
              {query.data.results.length === 0 ? (
                <article className="empty-card">
                  <h3>No collaborations yet</h3>
                  <p>Create the first collaboration record to verify the end-to-end flow.</p>
                </article>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Collaboration</th>
                      <th>PI</th>
                      <th>Researcher</th>
                      <th>Owner</th>
                      <th>Bioinformatics</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.results.map((project) => (
                      <tr key={project.id}>
                        <td>
                          <div className="table-primary">
                            <strong>{project.title}</strong>
                            <span>{project.description || "No description yet."}</span>
                          </div>
                        </td>
                        <td>{project.pi_name}</td>
                        <td>{project.researcher_name}</td>
                        <td>{project.owner ?? "Unassigned"}</td>
                        <td>{project.bioinformatician_assigned}</td>
                        <td>
                          <div className="table-actions">
                            <Link className="secondary-button" to={collaborationPath(project.id)}>
                              Open workspace
                            </Link>
                            <button className="danger-button" type="button" onClick={() => handleDeleteProject(project)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {deleteMutation.isError ? <p className="error-text">{deleteMutation.error.message}</p> : null}
          </>
        ) : null}
      </section>
    </>
  );
}
