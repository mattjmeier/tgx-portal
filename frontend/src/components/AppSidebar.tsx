import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookCopy,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  FlaskConical,
  Layers3,
  LibraryBig,
  LogOut,
  ShieldCheck,
  TestTubeDiagonal,
} from "lucide-react";
import { NavLink, useLocation, useMatch } from "react-router-dom";

import { fetchProject } from "../api/projects";
import { fetchStudies } from "../api/studies";
import { useAuth } from "../auth/AuthProvider";
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

export function AppSidebar() {
  const auth = useAuth();
  const location = useLocation();
  const workspaceChildMatch = useMatch("/projects/:projectId/*");
  const workspaceRootMatch = useMatch("/projects/:projectId");
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

  const studiesQuery = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => fetchStudies(projectId),
    enabled: Number.isFinite(projectId),
  });

  const studies = studiesQuery.data?.results ?? [];

  return (
    <Sidebar>
      <SidebarHeader className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Layers3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.68rem] uppercase tracking-[0.24em] text-sidebar-foreground/55">R-ODAF portal</p>
            <h1 className="truncate text-lg font-semibold text-sidebar-foreground">TGX Portal</h1>
          </div>
        </div>
        <p className="px-1 text-sm leading-6 text-sidebar-foreground/70">
          Intake, workspace hierarchy, and workflow metadata aligned in one operational shell.
        </p>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Application">
          <SidebarGroup>
            <SidebarGroupLabel>Application</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarBranch defaultOpen icon={FolderKanban} label="Projects">
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={location.pathname === "/projects"}>
                          <NavLink to="/projects">
                            <ClipboardList className="h-4 w-4" />
                            <span>Project registry</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={location.pathname === "/projects/new"}>
                          <NavLink to="/projects/new">
                            <FlaskConical className="h-4 w-4" />
                            <span>New project intake</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={location.pathname === "/library"}>
                          <NavLink to="/library">
                            <LibraryBig className="h-4 w-4" />
                            <span>Reference library</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarBranch>
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

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            {isWorkspaceRoute && projectQuery.data ? (
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarBranch defaultOpen icon={BookCopy} label="Current workspace">
                    <div className="mb-2 ml-4 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 py-3">
                      <p className="text-[0.68rem] uppercase tracking-[0.2em] text-sidebar-foreground/50">Active project</p>
                      <strong className="mt-1 block text-sm text-sidebar-foreground">{projectQuery.data.title}</strong>
                      <p className="mt-1 text-xs text-sidebar-foreground/60">PI {projectQuery.data.pi_name}</p>
                    </div>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={location.pathname === `/projects/${projectId}`}>
                          <NavLink to={`/projects/${projectId}`}>
                            <Layers3 className="h-4 w-4" />
                            <span>Workspace overview</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={location.pathname === `/projects/${projectId}/studies/new`}>
                          <NavLink to={`/projects/${projectId}/studies/new`}>
                            <FlaskConical className="h-4 w-4" />
                            <span>Add a study</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarBranch>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarBranch defaultOpen icon={FlaskConical} label="Studies">
                    <SidebarMenuSub>
                      {studies.length === 0 ? (
                        <SidebarMenuSubItem>
                          <div className="px-2.5 py-2 text-sm text-sidebar-foreground/55">No studies yet for this project.</div>
                        </SidebarMenuSubItem>
                      ) : (
                        studies.map((study) => (
                          <SidebarMenuSubItem key={study.id}>
                            <SidebarMenuSubButton asChild isActive={study.id === selectedStudyId}>
                              <NavLink to={`/projects/${projectId}?study=${study.id}#study-directory`}>
                                <FlaskConical className="h-4 w-4" />
                                <span>{study.species} {study.celltype}</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))
                      )}
                    </SidebarMenuSub>
                  </SidebarBranch>
                </SidebarMenuItem>

                {selectedStudyId !== null && Number.isFinite(selectedStudyId) ? (
                  <SidebarMenuItem>
                    <SidebarBranch defaultOpen icon={TestTubeDiagonal} label="Sample actions">
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild>
                            <a href="#sample-intake">
                              <TestTubeDiagonal className="h-4 w-4" />
                              <span>Create or import samples</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild>
                            <a href="#sample-explorer">
                              <ClipboardList className="h-4 w-4" />
                              <span>Open sample explorer</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild>
                            <a href="#sample-detail">
                              <BookCopy className="h-4 w-4" />
                              <span>Review sample details</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </SidebarBranch>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            ) : (
              <div className="rounded-md border border-dashed border-sidebar-border bg-sidebar-accent/20 px-3 py-3 text-sm text-sidebar-foreground/65">
                Open a project workspace to see studies, project actions, and sample-level navigation.
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/25 px-3 py-3">
          <p className="text-xs uppercase tracking-[0.22em] text-sidebar-foreground/50">Signed in</p>
          <p className="mt-2 text-sm font-medium text-sidebar-foreground">
            {auth.user?.username} · {auth.user?.profile.role}
          </p>
          <button
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-sidebar-border px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            type="button"
            onClick={() => void auth.logout()}
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
