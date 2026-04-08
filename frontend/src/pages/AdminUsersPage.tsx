import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AdminProjectOwnershipPanel } from "../components/AdminProjectOwnershipPanel";
import { createManagedUser, fetchUsers, updateManagedUserRole } from "../api/users";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const initialFormState = {
  username: "",
  email: "",
  password: "",
  role: "client" as const,
};

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const createMutation = useMutation({
    mutationFn: createManagedUser,
    onSuccess: async () => {
      setFormState(initialFormState);
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: "admin" | "client" | "system" }) =>
      updateManagedUserRole(userId, role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    createMutation.mutate(formState);
  }

  return (
    <section className="admin-page">
      <section className="admin-grid">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <p className="eyebrow">Admin</p>
            <CardTitle className="text-3xl">User management</CardTitle>
            <CardDescription className="max-w-xl text-base leading-8">
              Create development users and assign roles so we can exercise admin and client behavior without touching the database manually.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="admin-username">Username</Label>
                  <Input
                    id="admin-username"
                    required
                    value={formState.username}
                    onChange={(event) => setFormState((current) => ({ ...current, username: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    required
                    type="email"
                    value={formState.email}
                    onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="grid gap-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input
                    id="admin-password"
                    required
                    minLength={8}
                    type="password"
                    value={formState.password}
                    onChange={(event) => setFormState((current) => ({ ...current, password: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin-role">Role</Label>
                  <Select
                    value={formState.role}
                    onValueChange={(value) => setFormState((current) => ({ ...current, role: value as typeof current.role }))}
                  >
                    <SelectTrigger id="admin-role" aria-label="Role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={createMutation.isPending} type="submit">
                  {createMutation.isPending ? "Creating..." : "Create user"}
                </Button>
                {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <p className="eyebrow">Roles</p>
            <CardTitle className="text-3xl">Current users</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {usersQuery.isLoading ? <p>Loading users...</p> : null}
            {usersQuery.isError ? <p className="error-text">Unable to load users.</p> : null}
            {usersQuery.data ? (
              <div className="user-list">
                {usersQuery.data.results.map((user) => (
                  <Card className="border-border/70 shadow-none" key={user.id}>
                    <CardContent className="grid gap-4 p-5">
                      <div className="grid gap-1">
                        <p className="project-meta">{user.profile.role}</p>
                        <h3 className="text-xl font-semibold text-foreground">{user.username}</h3>
                        <p className="text-sm text-muted-foreground">{user.email || "No email provided."}</p>
                      </div>
                      <div className="grid gap-2 sm:max-w-52">
                        <Label htmlFor={`user-role-${user.id}`}>Role</Label>
                        <Select
                          value={user.profile.role}
                          onValueChange={(value) =>
                            updateRoleMutation.mutate({
                              userId: user.id,
                              role: value as "admin" | "client" | "system",
                            })
                          }
                        >
                          <SelectTrigger id={`user-role-${user.id}`} aria-label={`Role for ${user.username}`}>
                            <SelectValue placeholder="Assign role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="client">Client</SelectItem>
                            <SelectItem value="system">System</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
      <AdminProjectOwnershipPanel />
    </section>
  );
}
