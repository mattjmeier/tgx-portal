import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";

import { createStudy } from "../api/studies";
import { FlashBanner } from "./FlashBanner";
import { StudyForm } from "./StudyForm";

vi.mock("../api/studies", async () => {
  const actual = await vi.importActual<typeof import("../api/studies")>("../api/studies");
  return {
    ...actual,
    createStudy: vi.fn(),
  };
});

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/studies/new?collaboration=7"]}>
        <Routes>
          <Route
            element={
              <>
                <FlashBanner />
                <LocationDisplay />
                <Outlet />
              </>
            }
          >
            <Route path="/studies/new" element={<StudyForm projectId={7} projectTitle="Mercury tox study" />} />
            <Route path="/studies/:studyId" element={<div>Study workspace</div>} />
            <Route path="/studies/:studyId/onboarding" element={<div>Study onboarding wizard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudyForm", () => {
  it("redirects into the onboarding wizard after creation", async () => {
    vi.mocked(createStudy).mockResolvedValueOnce({
      id: 11,
      project: 7,
      project_title: "Mercury tox study",
      title: "Hepatocyte mercury dose response",
      species: "human",
      celltype: "hepatocyte",
      treatment_var: "mercury",
      batch_var: "batch-1",
    });

    renderForm();

    fireEvent.change(screen.getByRole("textbox", { name: /study title/i }), { target: { value: "Hepatocyte mercury dose response" } });
    fireEvent.change(screen.getByRole("textbox", { name: /cell type/i }), { target: { value: "hepatocyte" } });
    fireEvent.change(screen.getByRole("textbox", { name: /treatment variable/i }), { target: { value: "mercury" } });
    fireEvent.change(screen.getByRole("textbox", { name: /batch variable/i }), { target: { value: "batch-1" } });
    fireEvent.click(screen.getByRole("button", { name: /create study/i }));

    expect(await screen.findByText("Study onboarding wizard")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/studies/11/onboarding");
    expect(screen.getByText(/study created/i)).toBeInTheDocument();
    expect(screen.getByText(/hepatocyte mercury dose response/i)).toBeInTheDocument();
  });
});
