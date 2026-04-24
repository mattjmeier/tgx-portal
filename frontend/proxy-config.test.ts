import config from "./vite.config";

describe("vite dev proxy", () => {
  it("routes Django admin and API paths through the frontend dev server", () => {
    const server = config.server;

    expect(server).toBeDefined();
    expect(server?.proxy).toMatchObject({
      "/api": {
        target: "http://api:8000",
        changeOrigin: true,
      },
      "/admin": {
        target: "http://api:8000",
        changeOrigin: true,
      },
      "/static": {
        target: "http://api:8000",
        changeOrigin: true,
      },
    });
  });
});
