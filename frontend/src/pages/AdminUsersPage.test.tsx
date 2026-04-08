import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

import { AdminUsersPage } from "./AdminUsersPage";

vi.mock("../components/AdminProjectOwnershipPanel", () => ({
  AdminProjectOwnershipPanel: () => <div>Ownership panel</div>,
}));

vi.mock("../api/users", () => ({
  fetchUsers: vi.fn(async () => ({
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 1,
        username: "admin",
        email: "admin@example.com",
        profile: {
          role: "admin",
        },
      },
      {
        id: 2,
        username: "client",
        email: "client@example.com",
        profile: {
          role: "client",
        },
      },
    ],
  })),
  createManagedUser: vi.fn(),
  updateManagedUserRole: vi.fn(),
}));

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
  it("renders shadcn-style role selectors instead of native selects", async () => {
    const { container } = renderPage();

    await screen.findByText("client@example.com");

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector('select:not([aria-hidden="true"])')).not.toBeInTheDocument();
  });
});
