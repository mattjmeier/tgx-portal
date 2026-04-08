const species = ["human", "mouse", "rat", "hamster"];
const platforms = ["RNA-Seq", "TempO-Seq"];
const hierarchy = [
  ["Project", "Collaboration-level container used for ownership, intake, and reporting."],
  ["Study", "Distinct experiment inside a project, defined by species, cell type, or treatment design."],
  ["Sample", "Biological record inside a study, ready for assay attachment and bulk upload."],
  ["Assay", "Analytical run applied to a sample for downstream configuration generation."],
];

export function ReferenceLibraryPage() {
  return (
    <section className="workspace-route">
      <div className="section-header">
        <div>
          <p className="eyebrow">Reference library</p>
          <h2>Shared portal vocabulary</h2>
        </div>
      </div>

      <section className="workspace-intro-card">
        <div>
          <strong>Common selections</strong>
          <p>Use this page as a quick operator reference for species, platforms, and the hierarchy users see across the portal.</p>
        </div>
        <div>
          <strong>Designed for consistency</strong>
          <p>Keeping the taxonomy visible reduces ambiguity when clients and bioinformatics staff move between intake and workspace views.</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="project-list-panel">
          <div className="section-header compact-header">
            <div>
              <h3>Hierarchy</h3>
              <p className="muted-copy">The operational levels used throughout the portal.</p>
            </div>
          </div>
          <div className="grid gap-3">
            {hierarchy.map(([title, description]) => (
              <div className="hero-note-card" key={title}>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </article>

        <div className="grid gap-4">
          <article className="project-list-panel">
            <div className="section-header compact-header">
              <div>
                <h3>Species</h3>
                <p className="muted-copy">Current study-level options.</p>
              </div>
            </div>
            <div className="detail-pill-row">
              {species.map((item) => (
                <span className="detail-pill" key={item}>
                  {item}
                </span>
              ))}
            </div>
          </article>

          <article className="project-list-panel">
            <div className="section-header compact-header">
              <div>
                <h3>Platforms</h3>
                <p className="muted-copy">Assay platforms currently represented in the portal.</p>
              </div>
            </div>
            <div className="detail-pill-row">
              {platforms.map((item) => (
                <span className="detail-pill" key={item}>
                  {item}
                </span>
              ))}
            </div>
          </article>
        </div>
      </section>
    </section>
  );
}
