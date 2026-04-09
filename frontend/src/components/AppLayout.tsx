import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useMatch } from "react-router-dom";

import { fetchProject } from "../api/projects";
import { fetchStudies, type Study } from "../api/studies";
import {
  collaborationCreatePath,
  collaborationRegistryPath,
  globalStudyCreateRoute,
  studiesIndexPath,
} from "../lib/routes";
import { ActiveContextHeader } from "./ActiveContextHeader";
import { AppSidebar } from "./AppSidebar";
import { FlashBanner } from "./FlashBanner";
import { Button } from "./ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./ui/sidebar";

function formatStudyLabel(study: Study | null) {
  if (!study) {
    return null;
  }

  return `Study: ${study.title}`;
}

function getShellCopy(pathname: string, projectTitle?: string, studyLabel?: string | null) {
  if (pathname === collaborationRegistryPath) {
    return {
      breadcrumbs: [],
      eyebrow: "Collaborations",
      titleHelp: null,
      title: null,
      description: "Browse, search, and create collaborations without relying on duplicate registry links.",
      badge: null,
    };
  }

  if (pathname === "/studies") {
    return {
      breadcrumbs: [],
      eyebrow: "Studies",
      titleHelp: null,
      title: null,
      description: "Browse studies across collaborations.",
      badge: null,
    };
  }

  if (pathname === collaborationCreatePath) {
    return {
      breadcrumbs: ["Collaborations", "New collaboration"],
      eyebrow: "Create",
      titleHelp: null,
      title: "New collaboration",
      description: "Create the ownership container first, then add studies when the experimental design branches.",
      badge: null,
    };
  }

  if (pathname === "/library") {
    return {
      breadcrumbs: ["Reference library"],
      eyebrow: "Reference library",
      titleHelp: null,
      title: "Shared taxonomy",
      description: "Keep species, platforms, and hierarchy language visible across the portal.",
      badge: null,
    };
  }

  if (pathname === globalStudyCreateRoute) {
    return {
      breadcrumbs: projectTitle ? ["Create", "New study", projectTitle] : ["Create", "New study"],
      eyebrow: "Create",
      titleHelp: null,
      title: "Add a study",
      description: projectTitle ? `Create a new experiment under ${projectTitle}.` : "Select a collaboration, then define the new experiment.",
      badge: null,
    };
  }

  if (pathname.includes("/studies/new")) {
    return {
      breadcrumbs: ["Collaborations", projectTitle ?? "Active collaboration", "New study"],
      eyebrow: "Study intake",
      titleHelp: null,
      title: "Add a study",
      description: projectTitle ? `Create a new experiment under ${projectTitle}.` : "Create a new experiment under the active collaboration.",
      badge: null,
    };
  }

  return {
    breadcrumbs: ["Collaborations", projectTitle ?? "Active collaboration"],
    eyebrow: "Collaborations",
    titleHelp: null,
    title: null,
    description: null,
    badge: studyLabel ?? null,
  };
}

export function AppLayout() {
  const location = useLocation();
  const workspaceChildMatch = useMatch("/collaborations/:projectId/*");
  const workspaceRootMatch = useMatch("/collaborations/:projectId");
  const workspaceRouteMatch = workspaceChildMatch ?? workspaceRootMatch;
  const matchedProjectId = workspaceRouteMatch?.params.projectId;
  const isWorkspaceRoute = matchedProjectId !== undefined && /^\d+$/.test(matchedProjectId);
  const projectId = isWorkspaceRoute ? Number(matchedProjectId) : NaN;
  const studyWorkspaceChildMatch = useMatch("/studies/:studyId/*");
  const studyWorkspaceRootMatch = useMatch("/studies/:studyId");
  const studyWorkspaceRouteMatch = studyWorkspaceChildMatch ?? studyWorkspaceRootMatch;
  const matchedStudyId = studyWorkspaceRouteMatch?.params.studyId;
  const isStudyWorkspaceRoute = matchedStudyId !== undefined && /^\d+$/.test(matchedStudyId);
  const selectedStudyIdParam = new URLSearchParams(location.search).get("study");
  const selectedStudyId = selectedStudyIdParam ? Number(selectedStudyIdParam) : NaN;

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject(projectId),
    enabled: Number.isFinite(projectId),
  });

  const studiesQuery = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => fetchStudies(projectId),
    enabled: Number.isFinite(projectId),
  });

  const selectedStudy =
    Number.isFinite(selectedStudyId) && studiesQuery.data
      ? studiesQuery.data.results.find((study) => study.id === selectedStudyId) ?? null
      : null;
  const shellCopy = getShellCopy(location.pathname, projectQuery.data?.title, formatStudyLabel(selectedStudy));

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-[radial-gradient(circle_at_top_left,rgba(20,108,138,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.32),rgba(216,228,234,0.24))]">
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/88 backdrop-blur">
            <div className="flex items-start justify-between gap-3 px-4 py-4 md:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger className="md:hidden" />
                <ActiveContextHeader
                  badge={shellCopy.badge}
                  breadcrumbs={shellCopy.breadcrumbs}
                  description={shellCopy.description}
                  eyebrow={shellCopy.eyebrow}
                  titleHelp={shellCopy.titleHelp}
                  title={shellCopy.title}
                />
              </div>
              {isWorkspaceRoute ? (
                <Button asChild className="shrink-0" size="sm" variant="outline">
                  <Link to={collaborationRegistryPath}>Back to collaborations</Link>
                </Button>
              ) : null}
              {isStudyWorkspaceRoute ? (
                <Button asChild className="shrink-0" size="sm" variant="outline">
                  <Link to={studiesIndexPath}>Back to studies</Link>
                </Button>
              ) : null}
            </div>
          </header>

          <main className="flex-1 px-4 py-5 md:px-6 md:py-6">
            <FlashBanner />
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
