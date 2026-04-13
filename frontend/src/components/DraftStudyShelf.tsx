import { Link } from "react-router-dom";

import type { Study } from "../api/studies";
import { studiesIndexPath, studyOnboardingPath } from "../lib/routes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

type DraftStudyShelfProps = {
  studies: Study[];
};

export function DraftStudyShelf({ studies }: DraftStudyShelfProps) {
  if (studies.length === 0) {
    return null;
  }

  const sortedStudies = [...studies].sort((left, right) => right.id - left.id);
  const shelfLabel = sortedStudies.length === 1 ? "Draft study in progress" : `${sortedStudies.length} draft studies in progress`;

  return (
    <section className="border-b border-border/60 bg-background/72" aria-label="Draft studies in progress">
      <div className="flex flex-col gap-3 px-4 py-3 md:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Badge variant="secondary">{shelfLabel}</Badge>
          <p className="truncate text-sm text-muted-foreground">
            Resume onboarding where you left off without losing your place in the workspace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sortedStudies.map((study) => (
            <Button asChild className="max-w-full sm:max-w-80" key={study.id} size="sm" variant="outline">
              <Link className="truncate" to={studyOnboardingPath(study.id)}>
                {`Continue designing ${study.title}`}
              </Link>
            </Button>
          ))}
          {sortedStudies.length > 1 ? (
            <Button asChild size="sm" variant="ghost">
              <Link to={studiesIndexPath}>View all studies</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
