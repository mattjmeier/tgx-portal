import { directusUrl } from "./lib/directus";

const focusAreas = [
  {
    title: "Collections In Directus",
    body: "Projects, studies, samples, assays, plating metadata, and lookup tables should live in Directus as the source of truth.",
  },
  {
    title: "Custom Frontend",
    body: "Collaborators should use a guided portal for intake, spreadsheet validation, and config generation instead of the generic admin UI.",
  },
  {
    title: "Narrow Custom Logic",
    body: "Keep custom code focused on import validation, config artifact generation, and external integrations like Plane.",
  },
];

export default function App() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Directus Exploration</p>
        <h1>tgx-portal is ready for a fresh first pass.</h1>
        <p className="lede">
          This scaffold splits the system into a Directus data platform and a custom portal front end.
          It is intentionally small so we can model collections and workflows before rebuilding features.
        </p>
        <div className="hero-meta">
          <span>Directus URL</span>
          <code>{directusUrl}</code>
        </div>
      </section>

      <section className="grid">
        {focusAreas.map((item) => (
          <article className="card" key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      <section className="next-steps">
        <h2>Suggested next steps</h2>
        <ol>
          <li>Create the first Directus collections and relations from the docs.</li>
          <li>Define permissions for admin, client, and system roles.</li>
          <li>Prototype spreadsheet import and row-level validation flow.</li>
          <li>Decide whether config generation belongs in a Directus extension or a small companion service.</li>
        </ol>
      </section>
    </main>
  );
}
