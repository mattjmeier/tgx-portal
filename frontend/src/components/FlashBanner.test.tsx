import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";

import { FlashBanner } from "./FlashBanner";

function renderWithState(state: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/destination", state }]}>
      <Routes>
        <Route
          element={
            <>
              <FlashBanner />
              <Outlet />
            </>
          }
        >
          <Route path="/destination" element={<div>Destination</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("FlashBanner", () => {
  it("renders a success message from navigation state", async () => {
    renderWithState({
      flash: {
        variant: "success",
        title: "Collaboration created",
        description: "Next: add a study under this collaboration.",
        action: { label: "Add a study", to: "/collaborations/7/studies/new" },
      },
    });

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/collaboration created/i)).toBeInTheDocument();
    expect(screen.getByText(/next: add a study/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add a study/i })).toHaveAttribute("href", "/collaborations/7/studies/new");
  });

  it("ignores unrelated navigation state", () => {
    renderWithState({ somethingElse: true });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

