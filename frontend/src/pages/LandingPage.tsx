import { ArrowRight, FlaskConical, Layers3, LibraryBig, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { collaborationRegistryPath, homePath } from "../lib/routes";

const platformHighlights = [
  {
    description: "Replace ad hoc PDF intake and scattered spreadsheets with an audit-friendly metadata home.",
    icon: Layers3,
    title: "Centralized collaboration records",
  },
  {
    description: "Track projects, studies, samples, and assays through the same workspace used for operational review.",
    icon: FlaskConical,
    title: "Structured study operations",
  },
  {
    description: "Preserve role-based access for admins, collaborators, and system automations without duplicating context.",
    icon: ShieldCheck,
    title: "Controlled access by design",
  },
] as const;

export function LandingPage() {
  const auth = useAuth();
  const primaryTarget = auth.isAuthenticated ? collaborationRegistryPath : "/login";
  const primaryLabel = auth.isAuthenticated ? "Enter workspace" : "Sign in";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef5f2_0%,#d8e6df_100%)] text-slate-950">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(9,89,84,0.18),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(197,113,37,0.18),transparent_22%),linear-gradient(135deg,rgba(255,255,255,0.72),rgba(255,255,255,0))]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 md:px-10 lg:px-12">
        <header className="flex items-center justify-between gap-4 border-b border-slate-900/10 pb-5">
          <Link aria-label="TGx Portal home" className="flex items-center gap-3" to={homePath}>
            <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-900/10 bg-white/70 shadow-sm backdrop-blur">
              <img alt="TGx Portal logo" className="h-full w-full object-cover" height={48} src="/sidebar-logo.png" width={48} />
            </div>
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.28em] text-slate-700/70">Health Canada genomics</p>
              <p className="text-lg font-semibold text-slate-950">TGx Portal</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Button asChild className="rounded-full px-5" variant="outline">
              <Link to="/login">Credentials</Link>
            </Button>
            <Button asChild className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800">
              <Link to={primaryTarget}>
                {primaryLabel}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.9fr)] lg:gap-14 lg:py-16">
          <div className="space-y-8">
            <div className="space-y-5">
              <p className="text-sm uppercase tracking-[0.34em] text-teal-900/60">R-ODAF metadata authority</p>
              <div className="max-w-4xl space-y-4">
                <h1 className="font-serif text-5xl leading-[0.95] text-slate-950 md:text-6xl lg:text-7xl">
                  Regulatory transcriptomics intake without the PDF drift.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-800/80 md:text-xl">
                  TGx Portal gives the lab one operational front door for collaborations, study design, assay tracking, and
                  reproducible workflow configuration generation.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild className="h-12 rounded-full bg-teal-900 px-6 text-sm uppercase tracking-[0.14em] text-teal-50 hover:bg-teal-800">
                <Link to={primaryTarget}>
                  {primaryLabel}
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild className="h-12 rounded-full border-slate-900/15 bg-white/70 px-6 text-sm uppercase tracking-[0.14em]" variant="outline">
                <Link to={collaborationRegistryPath}>Browse active collaborations</Link>
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {platformHighlights.map(({ description, icon: Icon, title }) => (
                <Card key={title} className="border-slate-900/10 bg-white/60 shadow-[0_18px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
                  <CardHeader className="space-y-4 pb-3">
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-xl font-medium leading-7">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-7 text-slate-700">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Card className="relative overflow-hidden border-slate-900/10 bg-[linear-gradient(160deg,rgba(15,23,42,0.96),rgba(19,78,74,0.95))] text-slate-50 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.8)]">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]"
            />
            <CardHeader className="relative space-y-5 p-8">
              <p className="text-xs uppercase tracking-[0.34em] text-teal-100/70">Portal scope</p>
              <CardTitle className="max-w-sm font-serif text-4xl leading-tight text-white">
                Metadata governance, workflow readiness, and lab visibility in one place.
              </CardTitle>
            </CardHeader>
            <CardContent className="relative grid gap-5 p-8 pt-0">
              <div className="grid gap-3 rounded-[1.6rem] border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-3">
                  <LibraryBig className="size-5 text-amber-200" />
                  <p className="text-sm uppercase tracking-[0.22em] text-white/70">What teams get</p>
                </div>
                <ul className="grid gap-3 text-sm leading-7 text-slate-100/88">
                  <li>Study metadata that stays aligned with projects, samples, and assay execution.</li>
                  <li>Config bundle generation grounded in the same records used for operational intake.</li>
                  <li>Role-aware navigation for collaborators, bioinformatics staff, and automation workflows.</li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
                  <p className="text-3xl font-semibold text-white">1</p>
                  <p className="mt-2 leading-6 text-slate-100/80">Single point of authority for R-ODAF intake metadata.</p>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
                  <p className="text-3xl font-semibold text-white">3</p>
                  <p className="mt-2 leading-6 text-slate-100/80">Role bands designed into the workspace from the start.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
