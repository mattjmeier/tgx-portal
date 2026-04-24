import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AdminOwnershipAssignmentCard } from "../components/AdminOwnershipAssignmentCard";
import { createManagedUser, fetchUsers, updateManagedUserRole } from "../api/users";
import { WorkspaceSectionCard } from "../components/WorkspaceSectionCard";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

const initialFormState = {
  username: "",
  email: "",
  password: "",
  role: "client" as const,
};

const pageSize = 10;

function getAccessSummary(role: "admin" | "client" | "system", ownedProjectCount: number) {
  if (role === "admin") {
    return "Full admin access";
  }
  if (role === "system") {
    return "Automation account";
  }
  if (ownedProjectCount === 0) {
    return "Unassigned";
  }
  return `${ownedProjectCount} collaboration${ownedProjectCount === 1 ? "" : "s"}`;
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "client" | "system">("all");
  const [page, setPage] = useState(1);

  const usersQuery = useQuery({
    queryKey: ["users", page, search, roleFilter],
    queryFn: () =>
      fetchUsers({
        page,
        pageSize,
        ordering: "username",
        search: search.trim() || undefined,
        role: roleFilter === "all" ? undefined : roleFilter,
      }),
  });

  const createMutation = useMutation({
    mutationFn: createManagedUser,
    onSuccess: async () => {
      setFormState(initialFormState);
      setErrorMessage(null);
      setIsCreateDialogOpen(false);
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

  const totalCount = usersQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const firstRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(totalCount, page * pageSize);

  return (
    <section className="workspace-route">
      <WorkspaceSectionCard
        action={
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button">New user</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create user</DialogTitle>
                <DialogDescription>Add a development user and assign the initial role for portal access.</DialogDescription>
              </DialogHeader>
              <form className="grid gap-5" onSubmit={handleSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
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
                <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_220px]">
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
                        <SelectGroup>
                          <SelectItem value="client">Client</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
                <DialogFooter>
                  <Button disabled={createMutation.isPending} type="submit">
                    {createMutation.isPending ? "Creating..." : "Create user"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
        contentClassName="flex flex-col gap-4"
        description="Search the current roster, adjust roles inline, and open the create dialog only when a new user is needed."
        eyebrow="Users"
        title="User roles"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="w-full md:max-w-md">
            <Label htmlFor="user-search">Search users</Label>
            <Input
              id="user-search"
              placeholder="Search by username or email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full md:w-[220px]">
            <Label htmlFor="user-role-filter">Filter by role</Label>
            <select
              aria-hidden="true"
              className="sr-only"
              tabIndex={-1}
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as typeof roleFilter);
                setPage(1);
              }}
            >
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="client">Client</option>
              <option value="system">System</option>
            </select>
            <Select
              value={roleFilter}
              onValueChange={(value) => {
                setRoleFilter(value as typeof roleFilter);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filter by role" id="user-role-filter">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            {totalCount} user record{totalCount === 1 ? "" : "s"}
          </p>
          <p>
            Showing {firstRow}-{lastRow} of {totalCount}
          </p>
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-foreground">Username</TableHead>
                <TableHead className="text-foreground">Email</TableHead>
                <TableHead className="text-foreground">Role</TableHead>
                <TableHead className="text-foreground">Status / Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.isLoading ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={4}>
                    Loading users...
                  </TableCell>
                </TableRow>
              ) : usersQuery.isError ? (
                <TableRow>
                  <TableCell className="text-destructive" colSpan={4}>
                    Unable to load users.
                  </TableCell>
                </TableRow>
              ) : usersQuery.data?.results.length ? (
                usersQuery.data.results.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium text-foreground">{user.username}</span>
                        <span className="text-sm text-muted-foreground">{user.is_staff ? "Staff account" : "Portal account"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{user.email || "No email provided."}</TableCell>
                    <TableCell className="w-[220px]">
                      <select
                        aria-hidden="true"
                        className="sr-only"
                        tabIndex={-1}
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
                      <Select
                        value={user.profile.role}
                        onValueChange={(value) =>
                          updateRoleMutation.mutate({
                            userId: user.id,
                            role: value as "admin" | "client" | "system",
                          })
                        }
                      >
                        <SelectTrigger aria-label={`Role for ${user.username}`} id={`user-role-${user.id}`}>
                          <SelectValue placeholder="Assign role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="client">Client</SelectItem>
                            <SelectItem value="system">System</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{getAccessSummary(user.profile.role, user.owned_project_count)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={4}>
                    No users match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={page === 1} type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>
              Previous
            </Button>
            <Button
              disabled={page >= totalPages}
              type="button"
              variant="outline"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </WorkspaceSectionCard>

      <AdminOwnershipAssignmentCard />
    </section>
  );
}
