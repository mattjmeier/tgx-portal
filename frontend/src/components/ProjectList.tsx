import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { deleteProject, fetchProjects, type Project } from "../api/projects";

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
    const confirmed = window.confirm(`Delete project "${project.title}" and all of its studies and samples?`);
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
            <p className="eyebrow">Projects</p>
            <h2>Project catalog</h2>
          </div>
          <a className="ghost-link" href={`${apiBaseUrl}/api/health/`} target="_blank" rel="noreferrer">
            API health
          </a>
        </div>

        {query.isLoading ? <p>Loading projects...</p> : null}
        {query.isError ? <p className="error-text">The project list could not be loaded.</p> : null}

        {query.data ? (
          <>
            <p className="muted-copy">
              Showing {query.data.results.length} of {query.data.count} project records. Open a workspace to manage studies, samples, assays, and configuration output.
            </p>
            <div className="table-shell">
              {query.data.results.length === 0 ? (
                <article className="empty-card">
                  <h3>No projects yet</h3>
                  <p>Create the first record with the form above to verify the end-to-end flow.</p>
                </article>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Project</th>
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
                            <Link className="secondary-button" to={`/projects/${project.id}`}>
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
