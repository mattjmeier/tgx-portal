import { ProjectForm } from "../components/ProjectForm";
import { ProjectList } from "../components/ProjectList";

export function ProjectsPage() {
  return (
    <>
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Projects</p>
          <h2>Project intake and experiment navigation</h2>
          <p className="body-copy">
            Use projects for collaboration-level tracking. Create studies inside a project when one collaboration contains multiple experiments, conditions, or species-level branches.
          </p>
          <div className="hero-note-grid">
            <article className="hero-note-card">
              <strong>Project</strong>
              <p>Who is involved, what the collaboration is called, and who owns the work.</p>
            </article>
            <article className="hero-note-card">
              <strong>Study</strong>
              <p>The actual experiment nested under that collaboration, with its own species and treatment structure.</p>
            </article>
          </div>
        </div>
        <ProjectForm />
      </section>
      <ProjectList />
    </>
  );
}
