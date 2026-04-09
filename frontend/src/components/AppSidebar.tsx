import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ClipboardList,
  Download,
  FlaskConical,
  Layers3,
  LibraryBig,
  LogOut,
  PlusCircle,
  ShieldCheck,
  TestTubeDiagonal,
} from "lucide-react";
import { NavLink, useLocation, useMatch } from "react-router-dom";

import { downloadProjectConfig, fetchProject, fetchProjects } from "../api/projects";
import { fetchStudiesIndex, fetchStudy, type Study } from "../api/studies";
import { useAuth } from "../auth/AuthProvider";
import {
  collaborationCreatePath,
  collaborationPath,
  collaborationRegistryPath,
  globalStudyCreatePath,
  studiesIndexPath,
  studyWorkspacePath,
} from "../lib/routes";
import { cn } from "../lib/utils";
import { Collapsible, CollapsibleContent } from "./ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "./ui/sidebar";

const previewLimit = 5;
const expandedStudiesLimit = 40;
const sidebarIconClassName = "size-4 shrink-0 stroke-[1.9]";

function formatStudyLabel(study: Study) {
  return study.title;
}

function formatStudySecondary(study: Study, collaborationTitle?: string) {
  const speciesAndCelltype = `${study.species} · ${study.celltype}`;
  return collaborationTitle ? `${speciesAndCelltype} · ${collaborationTitle}` : speciesAndCelltype;
}

function isActiveCollaborationPath(pathname: string, projectId: number) {
  return pathname === collaborationPath(projectId) || pathname.startsWith(`${collaborationPath(projectId)}/`);
}

function getStudyTabPath(studyId: number, tab?: "contrasts" | "collaboration") {
  const params = new URLSearchParams();
  if (tab) {
    params.set("tab", tab);
  }

  const query = params.toString();
  return `${studyWorkspacePath(studyId)}${query ? `?${query}` : ""}`;
}

function getStudyIntakePath(studyId: number) {
  return `${studyWorkspacePath(studyId)}?intake=open`;
}

type SidebarBrowseBranchProps = {
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  label: string;
  open: boolean;
  routeTarget: string;
  setOpen: (value: boolean) => void;
  children: React.ReactNode;
};

function SidebarBrowseBranch({
  children,
  icon: Icon,
  isActive,
  label,
  open,
  routeTarget,
  setOpen,
}: SidebarBrowseBranchProps) {
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2">
        <SidebarMenuButton asChild className="min-w-0 flex-1" isActive={isActive}>
          <NavLink to={routeTarget}>
            <Icon className={sidebarIconClassName} />
            <span>{label}</span>
          </NavLink>
        </SidebarMenuButton>
        <SidebarMenuButton
          aria-expanded={open}
          aria-label={`Toggle ${label}`}
          className="w-10 justify-center px-0"
          isActive={isActive}
          size="sm"
          type="button"
          onClick={() => setOpen(!open)}
        >
          <ChevronRight className={cn(sidebarIconClassName, "transition-transform", open && "rotate-90")} />
        </SidebarMenuButton>
      </div>
      <CollapsibleContent className="pt-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function AppSidebar() {
  const auth = useAuth();
  const location = useLocation();
  const workspaceChildMatch = useMatch("/collaborations/:projectId/*");
  const workspaceRootMatch = useMatch("/collaborations/:projectId");
  const workspaceRouteMatch = workspaceChildMatch ?? workspaceRootMatch;
  const matchedProjectId = workspaceRouteMatch?.params.projectId;
  const isWorkspaceRoute = matchedProjectId !== undefined && /^\d+$/.test(matchedProjectId);
  const projectId = isWorkspaceRoute ? Number(matchedProjectId) : NaN;

  const studyWorkspaceChildMatch = useMatch("/studies/:studyId/*");
  const studyWorkspaceRootMatch = useMatch("/studies/:studyId");
  const studyWorkspaceMatch = studyWorkspaceChildMatch ?? studyWorkspaceRootMatch;
  const matchedStudyId = studyWorkspaceMatch?.params.studyId;
  const isStudyWorkspaceRoute = matchedStudyId !== undefined && /^\d+$/.test(matchedStudyId);
  const studyIdFromRoute = isStudyWorkspaceRoute ? Number(matchedStudyId) : null;

  const selectedStudyParam = new URLSearchParams(location.search).get("study");
  const selectedStudyIdFromSearch = selectedStudyParam ? Number(selectedStudyParam) : null;
  const activeStudyId = isStudyWorkspaceRoute ? studyIdFromRoute : Number.isFinite(projectId) ? selectedStudyIdFromSearch : null;

  const studyQuery = useQuery({
    queryKey: ["study", studyIdFromRoute],
    queryFn: () => fetchStudy(studyIdFromRoute as number),
    enabled: studyIdFromRoute !== null,
    placeholderData: (previousData) => previousData,
  });

  const activeProjectId = Number.isFinite(projectId) ? projectId : studyQuery.data?.project ?? null;

  const projectQuery = useQuery({
    queryKey: ["project", activeProjectId],
    queryFn: () => fetchProject(activeProjectId as number),
    enabled: activeProjectId !== null,
    placeholderData: (previousData) => previousData,
  });

  const [collaborationsOpen, setCollaborationsOpen] = useState(false);
  const [studiesOpen, setStudiesOpen] = useState(false);
  const [studiesExpanded, setStudiesExpanded] = useState(false);
  const [expandedStudyId, setExpandedStudyId] = useState<number | null>(null);

  useEffect(() => {
    if (activeProjectId !== null) {
      setCollaborationsOpen(true);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (activeStudyId !== null) {
      setStudiesOpen(true);
      setExpandedStudyId(activeStudyId);
    }
  }, [activeStudyId]);

  const collaborationsPreviewQuery = useQuery({
    queryKey: ["projects", "preview", previewLimit],
    queryFn: () => fetchProjects({ pageSize: previewLimit }),
    enabled: collaborationsOpen,
  });

  const studiesPreviewQuery = useQuery({
    queryKey: ["studies", "preview", studiesExpanded ? expandedStudiesLimit : previewLimit],
    queryFn: () => fetchStudiesIndex({ pageSize: studiesExpanded ? expandedStudiesLimit : previewLimit }),
    enabled: studiesOpen,
    placeholderData: (previousData) => previousData,
  });

  const visibleStudies = useMemo(() => studiesPreviewQuery.data?.results ?? [], [studiesPreviewQuery.data?.results]);

  const selectedStudy =
    studyQuery.data ?? (activeStudyId !== null ? visibleStudies.find((study) => study.id === activeStudyId) ?? null : null);

  const collaborationTitleById = new Map<number, string>(
    (collaborationsPreviewQuery.data?.results ?? []).map((project) => [project.id, project.title]),
  );

  const globalStudyLink = globalStudyCreatePath(activeProjectId);
  const isAdmin = auth.user?.profile.role === "admin";

  const configMutation = useMutation({
    mutationFn: downloadProjectConfig,
    onSuccess: (blob, projectIdForDownload) => {
      const safeTitle = (projectQuery.data?.title ?? `collaboration_${projectIdForDownload ?? "unknown"}`)
        .toLowerCase()
        .replace(/\s+/g, "_");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `config_bundle_${safeTitle}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });

  function handleStudyClick(event: React.MouseEvent<HTMLAnchorElement>, studyId: number) {
    setStudiesOpen(true);

    if (activeStudyId === studyId) {
      event.preventDefault();
      setExpandedStudyId((current) => (current === studyId ? null : studyId));
      return;
    }

    setExpandedStudyId(studyId);
  }

  return (
    <Sidebar>
      <SidebarHeader className="space-y-3">
        <div className="flex items-center gap-3 px-2">
          <div className="flex size-10 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Layers3 className="size-5 shrink-0 stroke-[1.9]" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.68rem] uppercase tracking-[0.24em] text-sidebar-foreground/55">Metadata tracker</p>
            <h1 className="truncate text-lg font-semibold text-sidebar-foreground">TGx Portal</h1>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Application">
          <SidebarGroup>
            <SidebarGroupLabel>Create</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === collaborationCreatePath}>
                    <NavLink to={collaborationCreatePath}>
                      <PlusCircle className={sidebarIconClassName} />
                      <span>New collaboration</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/studies/new"}>
                    <NavLink to={globalStudyLink}>
                      <FlaskConical className={sidebarIconClassName} />
                      <span>New study</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Browse</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarBrowseBranch
                    icon={ClipboardList}
                    isActive={location.pathname.startsWith(collaborationRegistryPath)}
                    label="Collaborations"
                    open={collaborationsOpen}
                    routeTarget={collaborationRegistryPath}
                    setOpen={setCollaborationsOpen}
                  >
                    <SidebarMenuSub>
                      {collaborationsPreviewQuery.isLoading ? (
                        <SidebarMenuSubItem>
                          <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">Loading collaborations...</div>
                        </SidebarMenuSubItem>
                      ) : null}
                      {collaborationsPreviewQuery.isError ? (
                        <SidebarMenuSubItem>
                          <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">Collaborations unavailable.</div>
                        </SidebarMenuSubItem>
                      ) : null}
                      {!collaborationsPreviewQuery.isLoading &&
                      !collaborationsPreviewQuery.isError &&
                      collaborationsPreviewQuery.data &&
                      collaborationsPreviewQuery.data.results.length === 0 ? (
                        <SidebarMenuSubItem>
                          <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">No collaborations yet.</div>
                        </SidebarMenuSubItem>
                      ) : null}
                      {collaborationsPreviewQuery.data?.results.map((project) => (
                        <SidebarMenuSubItem key={project.id}>
                          <SidebarMenuSubButton asChild isActive={isActiveCollaborationPath(location.pathname, project.id)}>
                            <NavLink to={collaborationPath(project.id)}>
                              <Layers3 className={sidebarIconClassName} />
                              <span>{project.title}</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                      {collaborationsPreviewQuery.data &&
                      (collaborationsPreviewQuery.data.next !== null ||
                        collaborationsPreviewQuery.data.count > collaborationsPreviewQuery.data.results.length) ? (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild>
                            <NavLink to={collaborationRegistryPath}>
                              <ClipboardList className={sidebarIconClassName} />
                              <span>More...</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ) : null}
                    </SidebarMenuSub>
                  </SidebarBrowseBranch>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarBrowseBranch
                    icon={FlaskConical}
                    isActive={location.pathname.startsWith(studiesIndexPath) || activeStudyId !== null}
                    label="Studies"
                    open={studiesOpen}
                    routeTarget={studiesIndexPath}
                    setOpen={setStudiesOpen}
                  >
                    <SidebarMenuSub>
                      {studiesPreviewQuery.isLoading && visibleStudies.length === 0 ? (
                        <SidebarMenuSubItem>
                          <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">Loading studies...</div>
                        </SidebarMenuSubItem>
                      ) : null}
                      {studiesPreviewQuery.isError && visibleStudies.length === 0 ? (
                        <SidebarMenuSubItem>
                          <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">Studies unavailable.</div>
                        </SidebarMenuSubItem>
                      ) : null}
                      {!studiesPreviewQuery.isLoading && !studiesPreviewQuery.isError && visibleStudies.length === 0 ? (
                        <SidebarMenuSubItem>
                          <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">No studies yet.</div>
                        </SidebarMenuSubItem>
                      ) : null}
                      {visibleStudies.map((study) => (
                        <SidebarMenuSubItem key={study.id}>
                          <SidebarMenuSubButton asChild isActive={activeStudyId === study.id || expandedStudyId === study.id}>
                            <NavLink to={studyWorkspacePath(study.id)} onClick={(event) => handleStudyClick(event, study.id)}>
                              <FlaskConical className={sidebarIconClassName} />
                              <span className="flex min-w-0 flex-col">
                                <span>{formatStudyLabel(study)}</span>
                                <span className="truncate text-xs text-sidebar-foreground/60">
                                  {formatStudySecondary(
                                    study,
                                    collaborationTitleById.get(study.project) ?? study.project_title ?? `Collaboration ${study.project}`,
                                  )}
                                </span>
                              </span>
                            </NavLink>
                          </SidebarMenuSubButton>
                          {expandedStudyId === study.id ? (
                            <SidebarMenuSub className="mt-1">
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={location.pathname === studyWorkspacePath(study.id) && location.search === ""}
                                >
                                  <NavLink to={studyWorkspacePath(study.id)}>
                                    <ClipboardList className={sidebarIconClassName} />
                                    <span>Samples</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={
                                    location.pathname === studyWorkspacePath(study.id) &&
                                    location.search.includes("tab=contrasts")
                                  }
                                >
                                  <NavLink to={getStudyTabPath(study.id, "contrasts")}>
                                    <FlaskConical className={sidebarIconClassName} />
                                    <span>Contrasts</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={
                                    location.pathname === studyWorkspacePath(study.id) &&
                                    location.search.includes("tab=collaboration")
                                  }
                                >
                                  <NavLink to={getStudyTabPath(study.id, "collaboration")}>
                                    <Layers3 className={sidebarIconClassName} />
                                    <span>Collaboration info</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton asChild isActive={location.search.includes("intake=open")}>
                                  <NavLink to={getStudyIntakePath(study.id)}>
                                    <TestTubeDiagonal className={sidebarIconClassName} />
                                    <span>Metadata onboarding</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton asChild>
                                  <NavLink to={getStudyTabPath(study.id, "collaboration")}>
                                    <Layers3 className={sidebarIconClassName} />
                                    <span>Study information</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              {isAdmin ? (
                                <SidebarMenuSubItem>
                                  <SidebarMenuButton
                                    className="justify-between"
                                    type="button"
                                    variant="outline"
                                    onClick={() => configMutation.mutate(study.project)}
                                  >
                                    <span className="flex items-center gap-3">
                                      <Download className={sidebarIconClassName} />
                                      <span>{configMutation.isPending ? "Preparing bundle..." : "Download config bundle"}</span>
                                    </span>
                                    <ChevronRight className={cn(sidebarIconClassName, "opacity-0")} />
                                  </SidebarMenuButton>
                                </SidebarMenuSubItem>
                              ) : null}
                            </SidebarMenuSub>
                          ) : null}
                        </SidebarMenuSubItem>
                      ))}
                      {studiesPreviewQuery.data &&
                      !studiesExpanded &&
                      (studiesPreviewQuery.data.next !== null ||
                        studiesPreviewQuery.data.count > studiesPreviewQuery.data.results.length) &&
                      visibleStudies.length === studiesPreviewQuery.data.results.length ? (
                        <SidebarMenuSubItem>
                          <SidebarMenuButton
                            className="min-h-0 justify-start px-2.5 py-1 text-xs font-normal italic text-sidebar-foreground/60 hover:bg-transparent hover:text-sidebar-foreground/85"
                            size="sm"
                            type="button"
                            onClick={() => setStudiesExpanded(true)}
                          >
                            <span>more...</span>
                          </SidebarMenuButton>
                        </SidebarMenuSubItem>
                      ) : null}
                    </SidebarMenuSub>
                  </SidebarBrowseBranch>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/library"}>
                    <NavLink to="/library">
                      <LibraryBig className={sidebarIconClassName} />
                      <span>Reference library</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {isAdmin ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith("/admin")}>
                      <NavLink to="/admin/users">
                        <ShieldCheck className={sidebarIconClassName} />
                        <span>Admin</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 pb-2">
          <p className="text-xs uppercase tracking-[0.22em] text-sidebar-foreground/50">Signed in</p>
          <p className="mt-1 truncate text-sm text-sidebar-foreground/75">
            {auth.user?.username} · {auth.user?.profile.role}
          </p>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" onClick={() => void auth.logout()}>
              <LogOut className={sidebarIconClassName} />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
