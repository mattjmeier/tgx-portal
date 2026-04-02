import { NavLink, Outlet, useLocation, useMatch } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../auth/AuthProvider";
import { fetchProject } from "../api/projects";
import { fetchStudies } from "../api/studies";

export function AppLayout() {
  const auth = useAuth();
  const location = useLocation();
  const workspaceMatch = useMatch("/projects/:projectId/*") ?? useMatch("/projects/:projectId");
  const projectId = Number(workspaceMatch?.params.projectId);
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

  const sidebarStudies = studiesQuery.data?.results ?? [];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">R-ODAF Portal</p>
          <h1 className="app-title">TGX Portal</h1>
          <p className="sidebar-copy">
            A shared operational home for collaboration intake, experiment structure, sample metadata, assays, and configuration generation.
          </p>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-section-label">Navigation</p>
          <NavLink className={({ isActive }) => (isActive ? "sidebar-link sidebar-link-active" : "sidebar-link")} to="/projects">
            <span className="sidebar-link-title">Projects</span>
            <span className="sidebar-link-copy">Create and browse collaboration records</span>
          </NavLink>
          {auth.user?.profile.role === "admin" ? (
            <NavLink className={({ isActive }) => (isActive ? "sidebar-link sidebar-link-active" : "sidebar-link")} to="/admin/users">
              <span className="sidebar-link-title">Admin</span>
              <span className="sidebar-link-copy">Manage users, roles, and project ownership</span>
            </NavLink>
          ) : null}
        </nav>

        {workspaceMatch ? (
          <section className="sidebar-panel sidebar-context-panel">
            <p className="sidebar-section-label">Project navigator</p>
            {projectQuery.data ? (
              <div className="sidebar-tree">
                <NavLink className="sidebar-tree-link sidebar-tree-root" to={`/projects/${projectId}`}>
                  <span className="sidebar-tree-label">Project</span>
                  <strong>{projectQuery.data.title}</strong>
                </NavLink>
                <div className="sidebar-tree-branch">
                  <a className="sidebar-tree-link" href="#project-setup">
                    View project setup
                  </a>
                  <NavLink className="sidebar-tree-link" to={`/projects/${projectId}/studies/new`}>
                    Create a study
                  </NavLink>
                  <a className="sidebar-tree-link" href="#study-directory">
                    Browse studies
                  </a>
                </div>
                <div className="sidebar-tree-group">
                  <p className="sidebar-tree-heading">Studies</p>
                  {studiesQuery.isLoading ? <p className="sidebar-tree-empty">Loading studies...</p> : null}
                  {sidebarStudies.length === 0 ? (
                    <p className="sidebar-tree-empty">No studies yet for this project.</p>
                  ) : (
                    sidebarStudies.map((study) => (
                      <NavLink
                        key={study.id}
                        className={study.id === selectedStudyId ? "sidebar-tree-link sidebar-tree-link-active" : "sidebar-tree-link"}
                        to={`/projects/${projectId}?study=${study.id}#study-directory`}
                      >
                        <span className="sidebar-tree-study-title">
                          {study.species} / {study.celltype}
                        </span>
                        <span className="sidebar-tree-copy">{study.treatment_var}</span>
                      </NavLink>
                    ))
                  )}
                </div>
                {selectedStudyId !== null && Number.isFinite(selectedStudyId) ? (
                  <div className="sidebar-tree-branch">
                    <a className="sidebar-tree-link" href="#sample-intake">
                      Create or import samples
                    </a>
                    <a className="sidebar-tree-link" href="#sample-explorer">
                      Open sample explorer
                    </a>
                    <a className="sidebar-tree-link" href="#sample-detail">
                      Review sample details
                    </a>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="sidebar-tree-empty">Loading project navigator...</p>
            )}
          </section>
        ) : (
          <section className="sidebar-panel">
            <p className="sidebar-section-label">Hierarchy</p>
            <dl className="hierarchy-list">
              <div>
                <dt>Project</dt>
                <dd>The collaboration-level container.</dd>
              </div>
              <div>
                <dt>Study</dt>
                <dd>A distinct experiment within a project.</dd>
              </div>
              <div>
                <dt>Sample</dt>
                <dd>A biological record inside a study.</dd>
              </div>
              <div>
                <dt>Assay</dt>
                <dd>The analytical run applied to a sample.</dd>
              </div>
            </dl>
          </section>
        )}

        <section className="sidebar-panel sidebar-user-panel">
          <p className="sidebar-section-label">Signed In</p>
          <div className="user-badge">
            <span>
              {auth.user?.username} · {auth.user?.profile.role}
            </span>
          </div>
          <button className="danger-button sidebar-signout" type="button" onClick={() => void auth.logout()}>
            Sign out
          </button>
        </section>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
