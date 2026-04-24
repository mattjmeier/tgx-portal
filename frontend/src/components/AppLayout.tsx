import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useMatch } from "react-router-dom";

import { fetchProject } from "../api/projects";
import { fetchStudy, fetchStudies, fetchStudiesIndex, type Study } from "../api/studies";
import {
  collaborationCreatePath,
  collaborationRegistryPath,
  collaborationPath,
  globalStudyCreateRoute,
  studiesIndexPath,
  studyOnboardingPath,
} from "../lib/routes";
import { ActiveContextHeader } from "./ActiveContextHeader";
import { AppSidebar } from "./AppSidebar";
import { DraftStudyShelf } from "./DraftStudyShelf";
import { FlashBanner } from "./FlashBanner";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./ui/sidebar";

function formatStudyLabel(study: Study | null) {
  if (!study) {
    return null;
  }

  return `Study: ${study.title}`;
}

function getShellCopy(pathname: string, projectId?: number | null, projectTitle?: string, studyLabel?: string | null) {
  if (pathname === "/") {
    return {
      breadcrumbs: [],
      eyebrow: "Home",
      titleHelp: null,
      title: "Portal overview",
      description: "Start from the portal home, then jump into collaborations, studies, or shared reference data.",
      badge: null,
    };
  }

  if (pathname === collaborationRegistryPath) {
    return {
      breadcrumbs: [],
      eyebrow: "Collaborations",
      titleHelp: null,
      title: null,
      description: "Browse, search, and create collaborations.",
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
      breadcrumbs: [
        { label: "Collaborations", to: collaborationRegistryPath },
        { label: "New collaboration" },
      ],
      eyebrow: "Collaborations",
      titleHelp: null,
      title: "New collaboration",
      description: "Create the ownership container first, then add studies when the experimental design branches.",
      badge: null,
    };
  }

  if (pathname === "/library") {
    return {
      breadcrumbs: [{ label: "Reference library" }],
      eyebrow: "Reference library",
      titleHelp: null,
      title: "Shared taxonomy",
      description: "Keep species, platforms, and hierarchy language visible across the portal.",
      badge: null,
    };
  }

  if (pathname === globalStudyCreateRoute) {
    return {
      breadcrumbs: [
        { label: "Studies", to: studiesIndexPath },
        { label: "New study" },
      ],
      eyebrow: "Studies",
      titleHelp: null,
      title: "New study",
      description: projectTitle ? `Create a new experiment under ${projectTitle}.` : "Select a collaboration, then define the new experiment.",
      badge: null,
    };
  }

  if (pathname.includes("/studies/new")) {
    const collaborationBreadcrumb = Number.isFinite(projectId)
      ? { label: projectTitle ?? "Active collaboration", to: collaborationPath(projectId as number) }
      : { label: projectTitle ?? "Active collaboration" };

    return {
      breadcrumbs: [
        { label: "Collaborations", to: collaborationRegistryPath },
        collaborationBreadcrumb,
        { label: "New study" },
      ],
      eyebrow: "Collaborations",
      titleHelp: null,
      title: "New study",
      description: projectTitle ? `Create a new experiment under ${projectTitle}.` : "Create a new experiment under the active collaboration.",
      badge: null,
    };
  }

  if (pathname.startsWith("/studies/")) {
    return {
      breadcrumbs: [
        { label: "Studies", to: studiesIndexPath },
        studyLabel ? { label: studyLabel } : { label: "Study" },
      ],
      eyebrow: "Studies",
      titleHelp: null,
      title: null,
      description: null,
      badge: null,
    };
  }

  return {
    breadcrumbs: [
      { label: "Collaborations", to: collaborationRegistryPath },
      Number.isFinite(projectId) ? { label: projectTitle ?? "Active collaboration", to: collaborationPath(projectId as number) } : { label: projectTitle ?? "Active collaboration" },
    ],
    eyebrow: "Collaborations",
    titleHelp: null,
    title: null,
    description: null,
    badge: studyLabel ?? null,
  };
}

export function AppLayout() {
  const location = useLocation();
  const pathname = location.pathname !== "/" ? location.pathname.replace(/\/$/, "") : location.pathname;
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

  const currentStudyId = isStudyWorkspaceRoute ? Number(matchedStudyId) : NaN;
  const currentStudyQuery = useQuery({
    queryKey: ["study", currentStudyId],
    queryFn: () => fetchStudy(currentStudyId),
    enabled: Number.isFinite(currentStudyId),
  });

  const studiesQuery = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => fetchStudies(projectId),
    enabled: Number.isFinite(projectId),
  });

  const studiesIndexQuery = useQuery({
    queryKey: ["studies-index", "resume-banner"],
    queryFn: () => fetchStudiesIndex({ pageSize: 100 }),
  });

  const selectedStudy =
    Number.isFinite(selectedStudyId) && studiesQuery.data
      ? studiesQuery.data.results.find((study) => study.id === selectedStudyId) ?? null
      : null;
  const draftStudies =
    studiesIndexQuery.data?.results
      .filter((study) => study.status === "draft")
      .sort((left, right) => right.id - left.id) ?? [];
  const isStudyOnboardingRoute = Number.isFinite(currentStudyId) && pathname === studyOnboardingPath(currentStudyId);
  const shellCopy = getShellCopy(
    pathname,
    Number.isFinite(projectId) ? projectId : null,
    projectQuery.data?.title,
    currentStudyQuery.data ? formatStudyLabel(currentStudyQuery.data) : formatStudyLabel(selectedStudy),
  );

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
            </div>
          </header>

          {draftStudies.length > 0 && !isStudyOnboardingRoute ? <DraftStudyShelf studies={draftStudies} /> : null}

          <main className="flex-1 px-4 py-5 md:px-6 md:py-6">
            <FlashBanner />
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
