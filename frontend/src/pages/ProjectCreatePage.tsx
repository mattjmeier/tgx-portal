import { Link } from "react-router-dom";

import { ProjectForm } from "../components/ProjectForm";

export function ProjectCreatePage() {
  return (
    <section className="workspace-route">
      <div className="section-header">
        <div>
          <p className="eyebrow">Project intake</p>
          <h2>Create a collaboration record</h2>
        </div>
        <Link className="ghost-link" to="/projects">
          Back to registry
        </Link>
      </div>

      <section className="workspace-intro-card">
        <div>
          <strong>Start with the collaboration</strong>
          <p>Capture the PI, researcher, assigned bioinformatician, and ownership context before branching into studies.</p>
        </div>
        <div>
          <strong>Studies stay separate</strong>
          <p>Add studies from the workspace once the project needs distinct species, cell systems, or treatment structures.</p>
        </div>
      </section>

      <section className="study-create-layout">
        <ProjectForm />
      </section>
    </section>
  );
}
