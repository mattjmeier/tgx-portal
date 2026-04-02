import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { assignProjectOwner, fetchProjects } from "../api/projects";
import { fetchUsers } from "../api/users";

export function AdminProjectOwnershipPanel() {
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });
  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const clientUsers = (usersQuery.data?.results ?? []).filter((user) => user.profile.role === "client");

  const assignmentMutation = useMutation({
    mutationFn: ({ projectId, ownerId }: { projectId: number; ownerId: number | null }) =>
      assignProjectOwner(projectId, ownerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <section className="workspace-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Ownership</p>
          <h2>Assign projects to clients</h2>
        </div>
      </div>
      {projectsQuery.isLoading || usersQuery.isLoading ? <p>Loading ownership data...</p> : null}
      {projectsQuery.isError || usersQuery.isError ? <p className="error-text">Unable to load project ownership data.</p> : null}
      {projectsQuery.data ? (
        <div className="user-list">
          {projectsQuery.data.results.map((project) => (
            <article className="project-card" key={project.id}>
              <p className="project-meta">{project.owner ?? "Unassigned"}</p>
              <h3>{project.title}</h3>
              <p>{project.description || "No description yet."}</p>
              <label>
                Owner
                <select
                  value={project.owner_id ?? ""}
                  onChange={(event) =>
                    assignmentMutation.mutate({
                      projectId: project.id,
                      ownerId: event.target.value ? Number(event.target.value) : null,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {clientUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          ))}
        </div>
      ) : null}
      {assignmentMutation.isError ? <p className="error-text">{assignmentMutation.error.message}</p> : null}
    </section>
  );
}
