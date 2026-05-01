import { shouldProxyToDjango } from "./viteProxy";

describe("vite dev proxy", () => {
  it.each(["/api/users/?page=1", "/admin/", "/admin/auth/user/", "/static/admin/css/base.css", "/media/report.tsv"])(
    "routes Django-owned path %s through the frontend dev server",
    (requestUrl) => {
      expect(shouldProxyToDjango(requestUrl)).toBe(true);
    },
  );

  it.each(["/", "/collaborations", "/admin/users", "/admin/users/", "/admin/users?page=1", "/admin/users/new"])(
    "leaves portal-owned path %s for Vite history fallback",
    (requestUrl) => {
      expect(shouldProxyToDjango(requestUrl)).toBe(false);
    },
  );

  it("matches proxy paths by URL pathname rather than query string", () => {
    expect(shouldProxyToDjango("/api?format=json")).toBe(true);
    expect(shouldProxyToDjango("/library?next=/admin/auth/user/")).toBe(false);
  });
});
