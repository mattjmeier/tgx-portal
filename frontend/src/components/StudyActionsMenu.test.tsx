import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { StudyActionsMenu } from "./StudyActionsMenu";

function renderMenu(props: Partial<ComponentProps<typeof StudyActionsMenu>> = {}) {
  return render(
    <MemoryRouter>
      <StudyActionsMenu
        collaborationId={7}
        studyId={11}
        studyTitle="MCF7 estrogen pulse"
        triggerLabel="Study actions"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("StudyActionsMenu", () => {
  it("shows the admin send to Plane action when no sync exists", () => {
    const onSyncToPlane = vi.fn();
    renderMenu({ canSyncToPlane: true, onSyncToPlane });

    fireEvent.click(screen.getByRole("button", { name: /study actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /send to plane/i }));

    expect(onSyncToPlane).toHaveBeenCalledWith(11);
  });

  it("shows retry for failed Plane syncs", () => {
    const onSyncToPlane = vi.fn();
    renderMenu({
      canSyncToPlane: true,
      onSyncToPlane,
      planeSync: {
        status: "failed",
        attempt_count: 1,
        last_error: "Plane failed.",
        plane_work_item_id: "",
        plane_work_item_url: "",
        updated_at: "2026-04-30T12:00:00Z",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /study actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /retry plane sync/i }));

    expect(onSyncToPlane).toHaveBeenCalledWith(11);
  });

  it("disables the Plane action while sync is pending", () => {
    renderMenu({
      canSyncToPlane: true,
      isSyncingToPlane: true,
      onSyncToPlane: vi.fn(),
      planeSync: {
        status: "pending",
        attempt_count: 1,
        last_error: "",
        plane_work_item_id: "",
        plane_work_item_url: "",
        updated_at: "2026-04-30T12:00:00Z",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /study actions/i }));

    expect(screen.getByRole("menuitem", { name: /sending to plane/i })).toHaveAttribute("aria-disabled", "true");
  });

  it("opens an existing Plane work item instead of retrying successful syncs", () => {
    renderMenu({
      canSyncToPlane: true,
      onSyncToPlane: vi.fn(),
      planeSync: {
        status: "succeeded",
        attempt_count: 1,
        last_error: "",
        plane_work_item_id: "work-item-id",
        plane_work_item_url: "http://plane.local/work-item-id",
        updated_at: "2026-04-30T12:00:00Z",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /study actions/i }));

    expect(screen.getByRole("menuitem", { name: /open in plane/i })).toHaveAttribute("href", "http://plane.local/work-item-id");
  });

  it("hides Plane actions for non-admin callers", () => {
    renderMenu({ canSyncToPlane: false, onSyncToPlane: vi.fn() });

    fireEvent.click(screen.getByRole("button", { name: /study actions/i }));

    expect(screen.queryByText(/plane/i)).not.toBeInTheDocument();
  });
});
