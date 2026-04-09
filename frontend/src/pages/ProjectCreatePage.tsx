import { ProjectForm } from "../components/ProjectForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export function ProjectCreatePage() {
  return (
    <section className="workspace-route">
      <div className="section-header">
        <div>
          <p className="eyebrow">Collaboration intake</p>
          <h2>Create a collaboration record</h2>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)] lg:items-start">
        <ProjectForm />

        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <p className="eyebrow">Reference</p>
            <CardTitle>Definitions</CardTitle>
            <CardDescription>Use these labels to orient the collaboration record before adding studies.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1 rounded-lg border border-border/70 bg-muted/30 p-4">
              <strong>Collaboration</strong>
              <p className="text-sm text-muted-foreground">
                The top-level intake record for ownership, PI context, and project coordination.
              </p>
            </div>
            <div className="grid gap-1 rounded-lg border border-border/70 bg-muted/30 p-4">
              <strong>Study</strong>
              <p className="text-sm text-muted-foreground">
                A distinct experiment under the collaboration, usually separated by design, species, or cell system.
              </p>
            </div>
            <div className="grid gap-1 rounded-lg border border-border/70 bg-muted/30 p-4">
              <strong>Sample</strong>
              <p className="text-sm text-muted-foreground">A biological record registered under a study before assays are attached.</p>
            </div>
            <div className="grid gap-1 rounded-lg border border-border/70 bg-muted/30 p-4">
              <strong>Assay</strong>
              <p className="text-sm text-muted-foreground">An analytical run applied to a sample for downstream workflow generation.</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </section>
  );
}
