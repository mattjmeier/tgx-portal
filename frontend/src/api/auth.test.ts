import { fetchCurrentUser, loginUser, logoutUser } from "./auth";

describe("auth API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates the current user through the shared api fetch layer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        username: "admin",
        email: "admin@example.com",
        profile: { role: "admin" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCurrentUser("token-123")).resolves.toMatchObject({
      username: "admin",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/me/");
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("Authorization")).toBe("Token token-123");
  });

  it("logs in through the shared api fetch layer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: "token-123",
        user: {
          id: 1,
          username: "admin",
          email: "admin@example.com",
          profile: { role: "admin" },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginUser("admin", "password")).resolves.toMatchObject({
      token: "token-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/login/");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ username: "admin", password: "password" }));
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("logs out through the shared api fetch layer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(logoutUser("token-123")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/logout/");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("Authorization")).toBe("Token token-123");
  });
});
