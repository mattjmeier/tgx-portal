import { apiFetch } from "./http";

describe("apiFetch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns a friendly timeout error when requests exceed the default timeout", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const requestPromise = apiFetch("/api/projects/");
    const expectation = expect(requestPromise).rejects.toThrow("Request timed out. Please try again.");

    await vi.advanceTimersByTimeAsync(30_000);

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a friendly cancellation error when an upstream signal aborts the request", async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const requestPromise = apiFetch("/api/projects/", { signal: controller.signal });
    controller.abort();

    await expect(requestPromise).rejects.toThrow("Request was cancelled. Please retry.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
