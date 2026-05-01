const djangoDevProxyPath = /^\/(admin|api|static|media)(\/.*)?$/;
const portalAdminPath = /^\/admin\/users(?:\/.*)?$/;

export function shouldProxyToDjango(requestUrl: string): boolean {
  const pathname = new URL(requestUrl, "http://vite.local").pathname;

  return djangoDevProxyPath.test(pathname) && !portalAdminPath.test(pathname);
}
