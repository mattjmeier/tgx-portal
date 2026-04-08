import { useState } from "react";
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
import { fetchStudies, type Study } from "../api/studies";
import { useAuth } from "../auth/AuthProvider";
import {
  collaborationCreatePath,
  collaborationPath,
  collaborationRegistryPath,
  collaborationStudyCreatePath,
  globalStudyCreatePath,
} from "../lib/routes";
import { cn } from "../lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { Separator } from "./ui/separator";
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

function formatStudyLabel(study: Study) {
  return `${study.species} ${study.celltype}`;
}

type SidebarBranchProps = {
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
};

function SidebarBranch({ children, defaultOpen = true, icon: Icon, label }: SidebarBranchProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <SidebarMenuButton aria-expanded={open} className="justify-between">
          <span className="flex items-center gap-3">
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </span>
          <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
        </SidebarMenuButton>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function isActiveCollaborationPath(pathname: string, projectId: number) {
  return pathname === collaborationPath(projectId) || pathname.startsWith(`${collaborationPath(projectId)}/`);
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
  const selectedStudyParam = new URLSearchParams(location.search).get("study");
  const selectedStudyId = selectedStudyParam ? Number(selectedStudyParam) : null;

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject(projectId),
    enabled: Number.isFinite(projectId),
  });

  const collaborationsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const studiesQuery = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => fetchStudies(projectId),
    enabled: Number.isFinite(projectId),
  });

  const studies = studiesQuery.data?.results ?? [];
  const selectedStudy = selectedStudyId ? studies.find((study) => study.id === selectedStudyId) ?? null : null;
  const globalStudyLink = globalStudyCreatePath(isWorkspaceRoute ? projectId : null);

  const configMutation = useMutation({
    mutationFn: downloadProjectConfig,
    onSuccess: (blob) => {
      const safeTitle = (projectQuery.data?.title ?? `collaboration_${projectId}`).toLowerCase().replace(/\s+/g, "_");
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

  return (
    <Sidebar>
      <SidebarHeader className="space-y-3">
        <div className="flex items-center gap-3 px-2">
          <div className="flex size-10 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Layers3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.68rem] uppercase tracking-[0.24em] text-sidebar-foreground/55">R-ODAF portal</p>
            <h1 className="truncate text-lg font-semibold text-sidebar-foreground">TGX Portal</h1>
          </div>
        </div>
        <p className="px-2 text-sm leading-6 text-sidebar-foreground/70">
          Intake, workspace hierarchy, and workflow metadata aligned in one operational shell.
        </p>
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
                      <PlusCircle className="h-4 w-4" />
                      <span>New collaboration</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/studies/new"}>
                    <NavLink to={globalStudyLink}>
                      <FlaskConical className="h-4 w-4" />
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
                  <SidebarBranch defaultOpen={false} icon={ClipboardList} label="Collaborations">
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={location.pathname === collaborationRegistryPath}>
                          <NavLink to={collaborationRegistryPath}>
                            <ClipboardList className="h-4 w-4" />
                            <span>Collaboration registry</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {collaborationsQuery.isLoading ? (
                        <SidebarMenuSubItem>
                          <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">Loading collaborations...</div>
                        </SidebarMenuSubItem>
                      ) : null}
                      {collaborationsQuery.isError ? (
                        <SidebarMenuSubItem>
                          <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">Collaborations unavailable.</div>
                        </SidebarMenuSubItem>
                      ) : null}
                      {collaborationsQuery.data?.results.map((project) => (
                        <SidebarMenuSubItem key={project.id}>
                          <SidebarMenuSubButton asChild isActive={isActiveCollaborationPath(location.pathname, project.id)}>
                            <NavLink to={collaborationPath(project.id)}>
                              <Layers3 className="h-4 w-4" />
                              <span>{project.title}</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </SidebarBranch>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarBranch defaultOpen={false} icon={FlaskConical} label="Studies">
                    <SidebarMenuSub>
                      {isWorkspaceRoute ? (
                        <>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={selectedStudyId === null}>
                              <NavLink to={`${collaborationPath(projectId)}#study-directory`}>
                                <ClipboardList className="h-4 w-4" />
                                <span>Study directory</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          {studiesQuery.isLoading ? (
                            <SidebarMenuSubItem>
                              <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">Loading studies...</div>
                            </SidebarMenuSubItem>
                          ) : null}
                          {studiesQuery.isError ? (
                            <SidebarMenuSubItem>
                              <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">Studies unavailable.</div>
                            </SidebarMenuSubItem>
                          ) : null}
                          {!studiesQuery.isLoading && !studiesQuery.isError && studies.length === 0 ? (
                            <SidebarMenuSubItem>
                              <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">No studies yet for this collaboration.</div>
                            </SidebarMenuSubItem>
                          ) : null}
                          {studies.map((study) => (
                            <SidebarMenuSubItem key={study.id}>
                              <SidebarMenuSubButton asChild isActive={study.id === selectedStudyId}>
                                <NavLink to={`${collaborationPath(projectId)}?study=${study.id}#study-directory`}>
                                  <FlaskConical className="h-4 w-4" />
                                  <span>{formatStudyLabel(study)}</span>
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </>
                      ) : (
                        <SidebarMenuSubItem>
                          <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">Open a collaboration to browse studies.</div>
                        </SidebarMenuSubItem>
                      )}
                    </SidebarMenuSub>
                  </SidebarBranch>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/library"}>
                    <NavLink to="/library">
                      <LibraryBig className="h-4 w-4" />
                      <span>Reference library</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {auth.user?.profile.role === "admin" ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith("/admin")}>
                      <NavLink to="/admin/users">
                        <ShieldCheck className="h-4 w-4" />
                        <span>Admin</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>

        <Separator />

        {isWorkspaceRoute && projectQuery.data ? (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Active collaboration</SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="mb-2 px-2">
                  <strong className="block text-sm text-sidebar-foreground">{projectQuery.data.title}</strong>
                  <p className="mt-1 text-xs text-sidebar-foreground/60">PI {projectQuery.data.pi_name}</p>
                </div>

                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname === collaborationPath(projectId)}>
                      <NavLink to={collaborationPath(projectId)}>
                        <Layers3 className="h-4 w-4" />
                        <span>Overview</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname === collaborationStudyCreatePath(projectId)}>
                      <NavLink to={collaborationStudyCreatePath(projectId)}>
                        <PlusCircle className="h-4 w-4" />
                        <span>Add study</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {auth.user?.profile.role === "admin" ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton type="button" onClick={() => configMutation.mutate(projectId)}>
                        <Download className="h-4 w-4" />
                        <span>{configMutation.isPending ? "Preparing bundle..." : "Download config bundle"}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {selectedStudy ? (
              <SidebarGroup>
                <SidebarGroupLabel>Active study</SidebarGroupLabel>
                <SidebarGroupContent>
                  <div className="mb-2 px-2">
                    <strong className="block text-sm text-sidebar-foreground">{formatStudyLabel(selectedStudy)}</strong>
                  </div>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <a href="#sample-intake">
                          <TestTubeDiagonal className="h-4 w-4" />
                          <span>Sample intake</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <a href="#sample-explorer">
                          <ClipboardList className="h-4 w-4" />
                          <span>Sample explorer</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <a href="#sample-detail">
                          <Layers3 className="h-4 w-4" />
                          <span>Sample details</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null}
          </>
        ) : (
          <div className="rounded-md border border-dashed border-sidebar-border bg-sidebar-accent/20 px-3 py-3 text-sm text-sidebar-foreground/65">
            Open a collaboration workspace to see studies, collaboration actions, and study-level navigation.
          </div>
        )}
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
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
