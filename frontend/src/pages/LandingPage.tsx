import { ArrowRight, BookMarked, ClipboardCheck, DatabaseZap, FlaskConical, FolderKanban, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  collaborationCreatePath,
  collaborationRegistryPath,
  globalStudyCreatePath,
  studiesIndexPath,
} from "../lib/routes";

const primaryActions = [
  {
    description: "Open collaboration records, review owners, and continue active intake work.",
    icon: FolderKanban,
    title: "Browse collaborations",
    to: collaborationRegistryPath,
  },
  {
    description: "Inspect studies across collaborations, including drafts waiting for metadata completion.",
    icon: FlaskConical,
    title: "Review studies",
    to: studiesIndexPath,
  },
  {
    description: "Keep shared platform, species, and terminology choices visible to everyone using the portal.",
    icon: BookMarked,
    title: "Open reference library",
    to: "/library",
  },
] as const;

const workflowSteps = [
  {
    detail: "Register the collaboration, owner, and scientific context so intake starts from a single authoritative record.",
    label: "Create a collaboration",
  },
  {
    detail: "Add one or more studies when experimental design branches by platform, species, treatment, or batch structure.",
    label: "Define study metadata",
  },
  {
    detail: "Use the resulting records to support sample tracking, assay visibility, and workflow configuration generation.",
    label: "Drive downstream operations",
  },
] as const;

const capabilityCards = [
  {
    description: "Replace PDF intake drift and disconnected spreadsheets with structured records tied to the operating workspace.",
    icon: ClipboardCheck,
    title: "Operational intake",
  },
  {
    description: "Keep projects, studies, samples, and assays connected so scientific metadata stays usable after submission.",
    icon: DatabaseZap,
    title: "Scientific traceability",
  },
  {
    description: "Preserve role-aware access for collaborators, staff, and system automations without splitting the experience.",
    icon: ShieldCheck,
    title: "Controlled access",
  },
] as const;

export function LandingPage() {
  const auth = useAuth();
  const isAdmin = auth.user?.profile.role === "admin";

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(19rem,0.9fr)]">
        <Card className="overflow-hidden border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(229,239,243,0.98))] shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)]">
          <CardHeader className="gap-4 pb-4">
            <Badge className="w-fit border-teal-800/20 bg-teal-900/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-teal-950" variant="outline">
              R-ODAF scientific data workspace
            </Badge>
            <div className="space-y-3">
              <CardTitle className="max-w-3xl font-serif text-3xl leading-tight text-slate-950 md:text-4xl">
                One operational home for collaboration intake, study metadata, and workflow-ready records.
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7 text-slate-700">
                TGx Portal is the lab workspace for managing regulatory transcriptomics metadata. Use it to register collaborations,
                define studies, keep sample context aligned with assay work, and maintain the records used for downstream pipeline
                configuration.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {capabilityCards.map(({ description, icon: Icon, title }) => (
              <div key={title} className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
                <div className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <Icon className="size-5" />
                </div>
                <h2 className="text-base font-semibold text-slate-950">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-700">{description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-slate-950 text-slate-50 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.8)]">
          <CardHeader className="pb-4">
            <CardTitle className="font-serif text-2xl text-white">Start here</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              The portal is most useful when users move directly into the records they need to create or review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {primaryActions.map(({ description, icon: Icon, title, to }) => (
              <Link
                key={title}
                className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
                to={to}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-teal-100">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
                </div>
                <ArrowRight className="mt-1 size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card className="border-slate-200/80">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-slate-950">Typical workflow</CardTitle>
            <CardDescription className="text-sm leading-6">
              The portal is organized around the sequence of work the lab already performs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {workflowSteps.map(({ detail, label }, index) => (
              <div className="flex gap-4" key={label}>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-900 text-sm font-semibold text-teal-50">
                  {index + 1}
                </div>
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-950">{label}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(244,247,248,1))]">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-slate-950">Direct actions</CardTitle>
            <CardDescription className="text-sm leading-6">
              Use the shortcuts below when you know the next record you need to create.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild className="justify-between rounded-xl bg-teal-900 px-4 text-teal-50 hover:bg-teal-800">
              <Link to={collaborationCreatePath}>
                Create a new collaboration
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild className="justify-between rounded-xl" variant="outline">
              <Link to={globalStudyCreatePath()}>
                Create a new study
                <ArrowRight />
              </Link>
            </Button>
            {isAdmin ? (
              <Button asChild className="justify-between rounded-xl" variant="outline">
                <Link to="/admin/users">
                  Open admin controls
                  <ArrowRight />
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
