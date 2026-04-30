import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { StudiesPage } from "./StudiesPage";
import { deleteStudy } from "../api/studies";

vi.mock("../api/studies", async () => {
  const actual = await vi.importActual<typeof import("../api/studies")>("../api/studies");
  return {
    ...actual,
    fetchStudiesIndex: vi.fn(async () => ({
      count: 3,
      next: null,
      previous: null,
      results: [
        {
          id: 11,
          project: 7,
          project_title: "Mercury tox study",
          title: "Hepatocyte mercury dose response",
          status: "draft",
          species: "human",
          celltype: "hepatocyte",
          treatment_var: "mercury",
          batch_var: "batch-1",
          sample_count: 2,
          assay_count: 4,
        },
        {
          id: 12,
          project: 7,
          project_title: "Mercury tox study",
          title: "Kidney cadmium follow-up",
          status: "active",
          species: "rat",
          celltype: "kidney",
          treatment_var: "cadmium",
          batch_var: "batch-2",
          sample_count: 1,
          assay_count: 2,
        },
        {
          id: 21,
          project: 8,
          project_title: "Cadmium follow-up",
          title: "Mouse cortex lead pilot",
          status: "active",
          species: "mouse",
          celltype: "cortex",
          treatment_var: "lead",
          batch_var: "batch-3",
          sample_count: 3,
          assay_count: 5,
        },
      ],
    })),
    deleteStudy: vi.fn(async () => undefined),
  };
});

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: {
      username: "admin",
      profile: { role: "admin" as const },
    },
  }),
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
      <MemoryRouter initialEntries={["/studies"]}>
        <Routes>
          <Route path="/studies" element={<StudiesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudiesPage", () => {
  it("groups studies by collaboration and shows the study title first", async () => {
    renderPage();

    const heading = await screen.findByRole("heading", { name: /studies/i });

    expect(heading).toBeInTheDocument();
    expect(heading.closest(".bg-card")).not.toBeNull();
    expect(await screen.findByRole("link", { name: /mercury tox study/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^cadmium follow-up$/i })).toBeInTheDocument();

    expect(await screen.findByRole("link", { name: /^hepatocyte mercury dose response$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^kidney cadmium follow-up$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^mouse cortex lead pilot$/i })).toBeInTheDocument();

    expect(screen.getByText(/human\s*·\s*hepatocyte/i)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /samples/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /processing metadata/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^open$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open collaboration/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^mercury tox study$/i })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /^cadmium follow-up$/i })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /continue onboarding for study hepatocyte mercury dose response/i })).toHaveAttribute(
      "href",
      "/studies/11/onboarding",
    );
    expect(screen.getAllByRole("link", { name: /review onboarding for study/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /delete study/i }).length).toBeGreaterThan(0);
  });

  it("requires typed confirmation before deleting from studies directory", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /delete study hepatocyte mercury dose response/i }));
    expect(await screen.findByRole("dialog", { name: /delete study/i })).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: /^delete study$/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type the study title/i), {
      target: { value: "Hepatocyte mercury dose response" },
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteStudy).toHaveBeenCalled();
      expect(vi.mocked(deleteStudy).mock.calls.at(-1)?.[0]).toBe(11);
    });
  });
});
