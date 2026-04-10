import { createAppQueryClient } from "./queryClient";

describe("createAppQueryClient", () => {
  it("uses explicit production-friendly query defaults", () => {
    const queryClient = createAppQueryClient();
    const options = queryClient.getDefaultOptions().queries;

    expect(options?.retry).toBe(1);
    expect(options?.staleTime).toBe(30_000);
    expect(options?.refetchOnWindowFocus).toBe(false);
  });
});
