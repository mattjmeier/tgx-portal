import { Link } from "react-router-dom";

import { ProjectList } from "../components/ProjectList";

export function ProjectsPage() {
  return (
    <section className="workspace-route">
      <div className="section-header">
        <div>
          <p className="eyebrow">Projects</p>
          <h2>Project intake</h2>
        </div>
      </div>

      <section className="workspace-intro-card">
        <div>
          <strong>Registry first</strong>
          <p>Use this page to browse existing collaboration records and open a workspace with one click.</p>
        </div>
        <div>
          <strong>Intake is now a dedicated route</strong>
          <p>Creating a project has its own page so the registry and hierarchy navigation stay cleaner and easier to scan.</p>
        </div>
      </section>

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Registry</p>
          <h2>Open the right workspace faster</h2>
          <p className="body-copy">
            Projects hold the collaboration-level record. Once you open a project, the sidebar exposes studies, sample actions, and deeper experimental navigation in a consistent place.
          </p>
          <div className="hero-note-grid">
            <article className="hero-note-card">
              <strong>Modern navigation</strong>
              <p>Shared sections stay fixed while the workspace hierarchy expands underneath the active project.</p>
            </article>
            <article className="hero-note-card">
              <strong>Dedicated intake route</strong>
              <p>Project creation has moved out of the registry so users can browse without competing form noise.</p>
            </article>
          </div>
        </div>
        <div className="project-form">
          <h2>Next step</h2>
          <p className="body-copy">Create a new project from its own route, or open an existing record below to continue into the workspace.</p>
          <Link className="secondary-button" to="/projects/new">
            Open project intake
          </Link>
        </div>
      </section>
      <ProjectList />
    </section>
  );
}
