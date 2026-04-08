import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, useLocation } from "react-router-dom";
import { vi } from "vitest";

import App from "./App";

const authState = {
  isLoading: false,
  isAuthenticated: true,
  user: {
    username: "mmeier",
    profile: {
      role: "admin" as const,
    },
  },
};

vi.mock("./auth/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => authState,
}));

vi.mock("./components/AppLayout", () => ({
  AppLayout: function MockAppLayout() {
    const location = useLocation();

    return (
      <div>
        <div data-testid="location">{`${location.pathname}${location.search}`}</div>
        <Outlet />
      </div>
    );
  },
}));

vi.mock("./pages/AdminUsersPage", () => ({
  AdminUsersPage: () => <div>Admin page</div>,
}));

vi.mock("./pages/LoginPage", () => ({
  LoginPage: () => <div>Login page</div>,
}));

vi.mock("./pages/ProjectCreatePage", () => ({
  ProjectCreatePage: () => <div>New collaboration page</div>,
}));

vi.mock("./pages/ProjectsPage", () => ({
  ProjectsPage: () => <div>Collaborations page</div>,
}));

vi.mock("./pages/ProjectWorkspacePage", () => ({
  ProjectWorkspacePage: () => <div>Collaboration workspace page</div>,
}));

vi.mock("./pages/ReferenceLibraryPage", () => ({
  ReferenceLibraryPage: () => <div>Reference library page</div>,
}));

vi.mock("./pages/StudyCreatePage", () => ({
  StudyCreatePage: () => <div>Global study page</div>,
}));

function renderApp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routes", () => {
  it("serves the collaboration registry from the new alias", () => {
    renderApp("/collaborations");

    expect(screen.getByText("Collaborations page")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/collaborations");
  });

  it("redirects legacy project registry URLs to collaboration URLs", () => {
    renderApp("/projects");

    expect(screen.getByText("Collaborations page")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/collaborations");
  });

  it("redirects legacy workspace URLs while preserving query parameters", () => {
    renderApp("/projects/7?study=11");

    expect(screen.getByText("Collaboration workspace page")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/collaborations/7?study=11");
  });

  it("exposes the global study creation route", () => {
    renderApp("/studies/new");

    expect(screen.getByText("Global study page")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/studies/new");
  });
});
