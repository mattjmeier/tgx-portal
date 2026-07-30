import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../api/auth";
import { fetchStudiesIndex, type Study } from "../api/studies";
import { LandingPage } from "./LandingPage";

let currentUser: AuthenticatedUser = {
  id: 7,
  username: "client",
  email: "client@example.com",
  profile: { role: "client" },
};

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    token: "test-token",
    user: currentUser,
  }),
}));

vi.mock("../api/studies", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/studies")>();
  return {
    ...actual,
    fetchStudiesIndex: vi.fn(),
  };
});

const studies: Study[] = [
  {
    id: 21,
    project: 4,
    project_title: "Mercury collaboration",
    title: "Most recently updated",
    description: "",
    status: "draft",
    species: "human",
    celltype: "Hepatocyte",
    treatment_var: "dose",
    batch_var: "plate",
    updated_at: "2026-07-30T14:30:00Z",
  },
  {
    id: 18,
    project: 3,
    project_title: "Aflatoxin collaboration",
    title: "Earlier study",
    description: "",
    status: "active",
    species: "rat",
    celltype: "Liver",
    treatment_var: "treatment",
    batch_var: "batch",
    updated_at: "2026-07-28T09:00:00Z",
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function renderPage(user = currentUser) {
  currentUser = user;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/studies/:studyId" element={<div>Opened study</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function studiesResponse(results: Study[] = studies) {
  return {
    count: results.length,
    next: null,
    previous: null,
    results,
  };
}

describe("LandingPage", () => {
  beforeEach(() => {
    localStorage.clear();
    currentUser = {
      id: 7,
      username: "client",
      email: "client@example.com",
      profile: { role: "client" },
    };
    vi.mocked(fetchStudiesIndex).mockReset();
    vi.mocked(fetchStudiesIndex).mockResolvedValue(studiesResponse());
  });

  it("renders the study workspace hierarchy and requests five recent studies from the server", async () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Toxicogenomics data portal" })).toBeInTheDocument();
    expect(screen.getByText("Create, continue, and review toxicogenomics studies.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create study" })).toHaveAttribute("href", "/studies/new");
    expect(screen.getByRole("link", { name: "New collaboration" })).toHaveAttribute("href", "/collaborations/new");
    expect(screen.queryByText(/admin controls/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchStudiesIndex).toHaveBeenCalledWith({ ordering: "-updated_at", pageSize: 5 });
    });
  });

  it("renders accessible studies in API order and opens a study from its row", async () => {
    renderPage();

    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]).getByText("Most recently updated")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Earlier study")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all studies" })).toHaveAttribute("href", "/studies");

    fireEvent.click(rows[1]);
    expect(await screen.findByText("Opened study")).toBeInTheDocument();
  });

  it("shows a loading state while recent studies are being fetched", () => {
    const request = deferred<ReturnType<typeof studiesResponse>>();
    vi.mocked(fetchStudiesIndex).mockReturnValue(request.promise);

    renderPage();

    expect(screen.getByText("Loading recent studies…")).toBeInTheDocument();
  });

  it("shows a retryable error state", async () => {
    vi.mocked(fetchStudiesIndex)
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce(studiesResponse());

    renderPage();

    expect(await screen.findByText("Recent studies couldn’t be loaded.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Most recently updated")).toBeInTheDocument();
    expect(fetchStudiesIndex).toHaveBeenCalledTimes(2);
  });

  it("explains the parent relationship and offers both creation actions when empty", async () => {
    vi.mocked(fetchStudiesIndex).mockResolvedValue(studiesResponse([]));

    renderPage();

    expect(await screen.findByText(/Every study belongs to a collaboration/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Create study" }).length).toBeGreaterThan(1);
    expect(screen.getByRole("link", { name: "Create collaboration" })).toHaveAttribute("href", "/collaborations/new");
  });

  it("persists getting-started dismissal per authenticated user", async () => {
    const firstRender = renderPage();

    expect(screen.getByRole("heading", { name: "Getting started" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss getting started" }));
    expect(localStorage.getItem("tgx-portal:getting-started-dismissed:7")).toBe("true");
    expect(screen.queryByRole("heading", { name: "Getting started" })).not.toBeInTheDocument();

    firstRender.unmount();
    renderPage();
    expect(screen.queryByRole("heading", { name: "Getting started" })).not.toBeInTheDocument();
  });

  it("keeps getting started visible for a different user", () => {
    localStorage.setItem("tgx-portal:getting-started-dismissed:7", "true");

    renderPage({
      id: 8,
      username: "another-client",
      email: "other@example.com",
      profile: { role: "client" },
    });

    expect(screen.getByRole("heading", { name: "Getting started" })).toBeInTheDocument();
  });
});
