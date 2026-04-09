import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { ProjectCreatePage } from "./ProjectCreatePage";

vi.mock("../components/ProjectForm", () => ({
  ProjectForm: () => <div>Project form</div>,
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
      <MemoryRouter initialEntries={["/collaborations/new"]}>
        <ProjectCreatePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectCreatePage", () => {
  it("places the definitions panel beside the create collaboration form", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /create a collaboration record/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /back to registry/i })).not.toBeInTheDocument();
    expect(screen.getByText("Project form")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /definitions/i })).toBeInTheDocument();
    expect(screen.getByText(/top-level intake record/i)).toBeInTheDocument();
    expect(screen.getByText(/distinct experiment under the collaboration/i)).toBeInTheDocument();
  });
});
