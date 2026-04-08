import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

import { StudyForm } from "./StudyForm";

vi.mock("../api/studies", () => ({
  createStudy: vi.fn(),
}));

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <StudyForm projectId={7} />
    </QueryClientProvider>,
  );
}

describe("StudyForm", () => {
  it("uses a combobox trigger for species selection", () => {
    const { container } = renderForm();

    expect(screen.getByRole("combobox", { name: /species/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/cell type/i)).toBeInTheDocument();
    expect(container.querySelector('select:not([aria-hidden="true"])')).not.toBeInTheDocument();
  });
});
