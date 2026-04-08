import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { assignProjectOwner, fetchProjects } from "../api/projects";
import { fetchUsers } from "../api/users";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

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
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <p className="eyebrow">Ownership</p>
        <CardTitle className="text-3xl">Assign projects to clients</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {projectsQuery.isLoading || usersQuery.isLoading ? <p>Loading ownership data...</p> : null}
        {projectsQuery.isError || usersQuery.isError ? <p className="error-text">Unable to load project ownership data.</p> : null}
        {projectsQuery.data ? (
          <div className="user-list">
            {projectsQuery.data.results.map((project) => (
              <Card className="border-border/70 shadow-none" key={project.id}>
                <CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_240px] md:items-start">
                  <div className="grid gap-1">
                    <p className="project-meta">{project.owner ?? "Unassigned"}</p>
                    <h3 className="text-xl font-semibold text-foreground">{project.title}</h3>
                    <p className="text-sm text-muted-foreground">{project.description || "No description yet."}</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`owner-${project.id}`}>Owner</Label>
                    <Select
                      value={project.owner_id ? String(project.owner_id) : "unassigned"}
                      onValueChange={(value) =>
                        assignmentMutation.mutate({
                          projectId: project.id,
                          ownerId: value === "unassigned" ? null : Number(value),
                        })
                      }
                    >
                      <SelectTrigger id={`owner-${project.id}`} aria-label={`Owner for ${project.title}`}>
                        <SelectValue placeholder="Assign owner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {clientUsers.map((user) => (
                          <SelectItem key={user.id} value={String(user.id)}>
                            {user.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
        {assignmentMutation.isError ? <p className="error-text">{assignmentMutation.error.message}</p> : null}
      </CardContent>
    </Card>
  );
}
