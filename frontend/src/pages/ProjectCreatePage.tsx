import { Link } from "react-router-dom";

import { collaborationRegistryPath } from "../lib/routes";
import { ProjectForm } from "../components/ProjectForm";

export function ProjectCreatePage() {
  return (
    <section className="workspace-route">
      <div className="section-header">
        <div>
          <p className="eyebrow">Collaboration intake</p>
          <h2>Create a collaboration record</h2>
        </div>
        <Link className="ghost-link" to={collaborationRegistryPath}>
          Back to registry
        </Link>
      </div>

      <section className="workspace-intro-card">
        <div>
          <strong>Collaboration</strong>
          <p>Use this form for the ownership, intake, PI, researcher, and bioinformatics context that sits above all studies.</p>
        </div>
        <div>
          <strong>Study</strong>
          <p>Add studies later when the collaboration needs a distinct experiment, species, cell system, or treatment structure.</p>
        </div>
      </section>

      <section className="study-create-layout">
        <ProjectForm />
      </section>
    </section>
  );
}
