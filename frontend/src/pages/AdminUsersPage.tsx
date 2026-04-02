import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AdminProjectOwnershipPanel } from "../components/AdminProjectOwnershipPanel";
import { createManagedUser, fetchUsers, updateManagedUserRole } from "../api/users";

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
        <section className="workspace-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>User management</h2>
          </div>
        </div>
        <p className="body-copy">
          Create development users and assign roles so we can exercise admin and client behavior without touching the database manually.
        </p>
        <form className="detail-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input required value={formState.username} onChange={(event) => setFormState((current) => ({ ...current, username: event.target.value }))} />
          </label>
          <label>
            Email
            <input required type="email" value={formState.email} onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label>
            Password
            <input
              required
              minLength={8}
              type="password"
              value={formState.password}
              onChange={(event) => setFormState((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
          <label>
            Role
            <select value={formState.role} onChange={(event) => setFormState((current) => ({ ...current, role: event.target.value as typeof current.role }))}>
              <option value="client">Client</option>
              <option value="admin">Admin</option>
              <option value="system">System</option>
            </select>
          </label>
          <button className="primary-button" disabled={createMutation.isPending} type="submit">
            {createMutation.isPending ? "Creating..." : "Create user"}
          </button>
          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        </form>
        </section>

        <section className="workspace-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Roles</p>
            <h2>Current users</h2>
          </div>
        </div>
        {usersQuery.isLoading ? <p>Loading users...</p> : null}
        {usersQuery.isError ? <p className="error-text">Unable to load users.</p> : null}
        {usersQuery.data ? (
          <div className="user-list">
            {usersQuery.data.results.map((user) => (
              <article className="project-card" key={user.id}>
                <p className="project-meta">{user.profile.role}</p>
                <h3>{user.username}</h3>
                <p>{user.email || "No email provided."}</p>
                <label>
                  Role
                  <select
                    value={user.profile.role}
                    onChange={(event) =>
                      updateRoleMutation.mutate({
                        userId: user.id,
                        role: event.target.value as "admin" | "client" | "system",
                      })
                    }
                  >
                    <option value="admin">Admin</option>
                    <option value="client">Client</option>
                    <option value="system">System</option>
                  </select>
                </label>
              </article>
            ))}
          </div>
        ) : null}
        </section>
      </section>
      <AdminProjectOwnershipPanel />
    </section>
  );
}
