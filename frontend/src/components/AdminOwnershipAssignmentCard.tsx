import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { assignProjectOwner, fetchProjects } from "../api/projects";
import { fetchUsers } from "../api/users";
import { WorkspaceSectionCard } from "./WorkspaceSectionCard";
import { SearchableSelect } from "./SearchableSelect";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

export function AdminOwnershipAssignmentCard() {
  const queryClient = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects", "admin-ownership"],
    queryFn: () =>
      fetchProjects({
        page: 1,
        pageSize: 100,
        ordering: "title",
      }),
  });
  const usersQuery = useQuery({
    queryKey: ["users", "ownership-clients"],
    queryFn: () =>
      fetchUsers({
        page: 1,
        pageSize: 100,
        ordering: "username",
        role: "client",
      }),
  });

  const assignmentMutation = useMutation({
    mutationFn: ({ projectId, ownerId }: { projectId: number; ownerId: number | null }) =>
      assignProjectOwner(projectId, ownerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const selectedProject = (projectsQuery.data?.results ?? []).find((project) => String(project.id) === selectedProjectId);
  const selectedClient = (usersQuery.data?.results ?? []).find((user) => String(user.id) === selectedClientId);

  return (
    <WorkspaceSectionCard
      contentClassName="flex flex-col gap-6"
      description="Assign a single collaboration owner from the current client roster. Study-level access remains a later phase."
      eyebrow="Ownership"
      title="Collaboration ownership"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ownership-client">Client</Label>
          <SearchableSelect
            ariaLabel="Select a client"
            emptyMessage="No client users found."
            options={(usersQuery.data?.results ?? []).map((user) => ({
              value: String(user.id),
              label: user.username,
              description: user.email || "No email provided.",
            }))}
            placeholder="Select a client"
            searchPlaceholder="Search clients..."
            triggerId="ownership-client"
            value={selectedClientId}
            disabled={usersQuery.isLoading || usersQuery.isError}
            onValueChange={setSelectedClientId}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ownership-project">Collaboration</Label>
          <SearchableSelect
            ariaLabel="Select a collaboration"
            emptyMessage="No collaborations found."
            options={(projectsQuery.data?.results ?? []).map((project) => ({
              value: String(project.id),
              label: project.title,
              description: project.owner ? `Current owner: ${project.owner}` : "Currently unassigned",
            }))}
            placeholder="Select a collaboration"
            searchPlaceholder="Search collaborations..."
            triggerId="ownership-project"
            value={selectedProjectId}
            disabled={projectsQuery.isLoading || projectsQuery.isError}
            onValueChange={setSelectedProjectId}
          />
        </div>
      </div>

      {projectsQuery.isLoading || usersQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading ownership data...</p> : null}
      {projectsQuery.isError || usersQuery.isError ? <p className="error-text">Unable to load project ownership data.</p> : null}

      <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">Current owner</span>
          <Badge variant={selectedProject?.owner ? "secondary" : "outline"}>{selectedProject?.owner ?? "Unassigned"}</Badge>
          {selectedClient ? <Badge variant="outline">Selected client: {selectedClient.username}</Badge> : null}
        </div>
        <div className="grid gap-1">
          <p className="text-sm font-medium text-foreground">{selectedProject?.title ?? "Select a collaboration to review ownership."}</p>
          <p className="text-sm text-muted-foreground">
            {selectedProject?.description || "Choose a collaboration and client, then assign or clear the current owner."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!selectedProject || !selectedClient || assignmentMutation.isPending}
          type="button"
          onClick={() => {
            if (!selectedProject || !selectedClient) {
              return;
            }

            assignmentMutation.mutate({
              projectId: selectedProject.id,
              ownerId: selectedClient.id,
            });
          }}
        >
          Assign owner
        </Button>
        <Button
          disabled={!selectedProject || selectedProject.owner_id === null || assignmentMutation.isPending}
          type="button"
          variant="outline"
          onClick={() => {
            if (!selectedProject) {
              return;
            }

            assignmentMutation.mutate({
              projectId: selectedProject.id,
              ownerId: null,
            });
          }}
        >
          Clear owner
        </Button>
        {assignmentMutation.isError ? <p className="error-text">{assignmentMutation.error.message}</p> : null}
      </div>
    </WorkspaceSectionCard>
  );
}
