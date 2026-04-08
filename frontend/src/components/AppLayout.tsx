import { Outlet, useLocation, useMatch } from "react-router-dom";

import { AppSidebar } from "./AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./ui/sidebar";

function getShellCopy(pathname: string, projectTitle?: string) {
  if (pathname === "/projects") {
    return {
      eyebrow: "Projects",
      title: "Project registry",
      description: "Browse collaboration records, then branch into study workspaces as projects mature.",
    };
  }

  if (pathname === "/projects/new") {
    return {
      eyebrow: "Project intake",
      title: "Create a new project",
      description: "Start with a collaboration record, then add studies only when the experimental design diverges.",
    };
  }

  if (pathname === "/library") {
    return {
      eyebrow: "Reference library",
      title: "Shared taxonomy",
      description: "Keep species, platforms, and hierarchy language visible across the portal.",
    };
  }

  if (pathname.includes("/studies/new")) {
    return {
      eyebrow: "Study intake",
      title: "Add a study",
      description: projectTitle ? `Create a new experiment under ${projectTitle}.` : "Create a new experiment under the active project.",
    };
  }

  return {
    eyebrow: "Workspace",
    title: projectTitle ?? "Project workspace",
    description: "Navigate the project hierarchy with dedicated sections instead of one overloaded page.",
  };
}

export function AppLayout() {
  const location = useLocation();
  const workspaceChildMatch = useMatch("/projects/:projectId/*");
  const workspaceRootMatch = useMatch("/projects/:projectId");
  const workspaceRouteMatch = workspaceChildMatch ?? workspaceRootMatch;
  const matchedProjectId = workspaceRouteMatch?.params.projectId;
  const isWorkspaceRoute = matchedProjectId !== undefined && /^\d+$/.test(matchedProjectId);
  const projectTitle = undefined;
  const shellCopy = getShellCopy(location.pathname, projectTitle);

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-[radial-gradient(circle_at_top_left,rgba(20,108,138,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.32),rgba(216,228,234,0.24))]">
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/88 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-4 md:px-6">
              <SidebarTrigger className="md:hidden" />
              <div className="min-w-0">
                <p className="text-[0.72rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">{shellCopy.eyebrow}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground md:text-2xl">{shellCopy.title}</h1>
                  {isWorkspaceRoute ? <span className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground">Workspace</span> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{shellCopy.description}</p>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 md:px-6 md:py-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
