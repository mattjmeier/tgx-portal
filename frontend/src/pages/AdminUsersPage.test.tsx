import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

import { AdminUsersPage } from "./AdminUsersPage";

const fetchUsersMock = vi.fn();
const createManagedUserMock = vi.fn();
const updateManagedUserRoleMock = vi.fn();

vi.mock("../components/AdminOwnershipAssignmentCard", () => ({
  AdminOwnershipAssignmentCard: () => <div>Ownership panel</div>,
}));

vi.mock("../api/users", () => ({
  fetchUsers: (...args: unknown[]) => fetchUsersMock(...args),
  createManagedUser: (...args: unknown[]) => createManagedUserMock(...args),
  updateManagedUserRole: (...args: unknown[]) => updateManagedUserRoleMock(...args),
}));

const allUsers = [
  {
    id: 1,
    username: "admin",
    email: "admin@example.com",
    owned_project_count: 0,
    profile: {
      role: "admin" as const,
    },
  },
  {
    id: 2,
    username: "client-a",
    email: "client-a@example.com",
    owned_project_count: 3,
    profile: {
      role: "client" as const,
    },
  },
  {
    id: 3,
    username: "system-bot",
    email: "system@example.com",
    owned_project_count: 0,
    profile: {
      role: "system" as const,
    },
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminUsersPage />
    </QueryClientProvider>,
  );
}

describe("AdminUsersPage", () => {
  beforeEach(() => {
    fetchUsersMock.mockImplementation(async (options?: { search?: string; role?: string; page?: number; pageSize?: number }) => {
      const normalizedSearch = options?.search?.toLowerCase().trim() ?? "";
      const filteredUsers = allUsers.filter((user) => {
        const matchesSearch =
          normalizedSearch.length === 0 ||
          user.username.toLowerCase().includes(normalizedSearch) ||
          user.email.toLowerCase().includes(normalizedSearch);
        const matchesRole = !options?.role || user.profile.role === options.role;
        return matchesSearch && matchesRole;
      });

      return {
        count: filteredUsers.length,
        next: null,
        previous: null,
        results: filteredUsers,
      };
    });
    createManagedUserMock.mockResolvedValue({
      id: 10,
      username: "new-user",
      email: "new-user@example.com",
      owned_project_count: 0,
      profile: {
        role: "client" as const,
      },
    });
    updateManagedUserRoleMock.mockResolvedValue({
      ...allUsers[1],
      profile: {
        role: "admin" as const,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a table-based registry and updates search/filter queries", async () => {
    const { container } = renderPage();

    await screen.findByText("client-a@example.com");

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Username" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status / Access" })).toBeInTheDocument();
    expect(screen.getByText("Ownership panel")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "client-a" } });

    await waitFor(() => {
      expect(fetchUsersMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: "client-a",
          role: undefined,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();
      expect(screen.getByText("client-a@example.com")).toBeInTheDocument();
    });

    const selects = container.querySelectorAll("select");
    fireEvent.change(selects[0], { target: { value: "client" } });

    await waitFor(() => {
      expect(fetchUsersMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: "client-a",
          role: "client",
        }),
      );
    });
  });

  it("submits the new-user dialog with the default client role", async () => {
    const { container } = renderPage();

    await screen.findByText("admin@example.com");
    fireEvent.click(screen.getByRole("button", { name: "New user" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Username"), { target: { value: "new-user" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "new-user@example.com" } });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "password123" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "Create user" }));

    await waitFor(() => {
      expect(createManagedUserMock.mock.calls[0]?.[0]).toEqual({
        username: "new-user",
        email: "new-user@example.com",
        password: "password123",
        role: "client",
      });
    });
  });

  it("keeps inline role assignment in the registry", async () => {
    const { container } = renderPage();

    await screen.findByText("client-a@example.com");

    const selects = container.querySelectorAll("select");
    fireEvent.change(selects[2], { target: { value: "admin" } });

    await waitFor(() => {
      expect(updateManagedUserRoleMock).toHaveBeenCalledWith(2, "admin");
    });
  });
});
