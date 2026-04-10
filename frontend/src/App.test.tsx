import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";

describe("App", () => {
  it("renders the login screen for signed-out users", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/api/auth/me/")) {
          return {
            ok: false,
            json: async () => ({ detail: "Authentication credentials were not provided." }),
          };
        }

        return {
          ok: true,
          json: async () => ({ count: 0, next: null, previous: null, results: [] }),
        };
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/projects"]}>
            <App />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", {
        name: /access the genomics portal/i,
      }),
    ).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
