import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

import { AdminOwnershipAssignmentCard } from "./AdminOwnershipAssignmentCard";

const fetchProjectsMock = vi.fn();
const fetchUsersMock = vi.fn();
const assignProjectOwnerMock = vi.fn();

vi.mock("../api/projects", () => ({
  fetchProjects: (...args: unknown[]) => fetchProjectsMock(...args),
  assignProjectOwner: (...args: unknown[]) => assignProjectOwnerMock(...args),
}));

vi.mock("../api/users", () => ({
  fetchUsers: (...args: unknown[]) => fetchUsersMock(...args),
}));

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminOwnershipAssignmentCard />
    </QueryClientProvider>,
  );
}

describe("AdminOwnershipAssignmentCard", () => {
  beforeEach(() => {
    fetchProjectsMock.mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 101,
          owner: "client-a",
          owner_id: 2,
          pi_name: "PI One",
          researcher_name: "Researcher One",
          bioinformatician_assigned: "Bioinfo One",
          title: "Collaboration Alpha",
          description: "Current alpha collaboration.",
          created_at: "2026-04-23T12:00:00Z",
        },
        {
          id: 102,
          owner: null,
          owner_id: null,
          pi_name: "PI Two",
          researcher_name: "Researcher Two",
          bioinformatician_assigned: "Bioinfo Two",
          title: "Collaboration Beta",
          description: "Current beta collaboration.",
          created_at: "2026-04-23T12:00:00Z",
        },
      ],
    });
    fetchUsersMock.mockResolvedValue({
      count: 11,
      next: null,
      previous: null,
      results: Array.from({ length: 11 }, (_, index) => ({
        id: index + 1,
        username: `client-${index + 1}`,
        email: `client-${index + 1}@example.com`,
        owned_project_count: 0,
        profile: {
          role: "client" as const,
        },
      })),
    });
    assignProjectOwnerMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads only client users and assigns a selected collaboration owner", async () => {
    const { container } = renderCard();

    await screen.findByText("Collaboration ownership");
    await waitFor(() => {
      expect(screen.queryByText("Loading ownership data...")).not.toBeInTheDocument();
    });

    expect(fetchUsersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "client",
        pageSize: 100,
        ordering: "username",
      }),
    );

    const selects = container.querySelectorAll("select");
    fireEvent.change(selects[0], { target: { value: "11" } });
    fireEvent.change(selects[1], { target: { value: "102" } });

    await waitFor(() => {
      expect(screen.getByText("Current beta collaboration.")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign owner" }));

    await waitFor(() => {
      expect(assignProjectOwnerMock).toHaveBeenCalledWith(102, 11);
    });
  });
});
