import { ArrowRight, FlaskConical, RefreshCw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import type { Study } from "../api/studies";
import { useRecentStudies } from "../hooks/useRecentStudies";
import {
  collaborationCreatePath,
  globalStudyCreatePath,
  studiesIndexPath,
  studyWorkspacePath,
} from "../lib/routes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

function statusLabel(status: Study["status"]) {
  return status === "draft" ? "Draft" : "Active";
}

function RecentStudyTable({ studies }: { studies: Study[] }) {
  const navigate = useNavigate();

  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-10 w-[45%] px-5">Study</TableHead>
          <TableHead className="hidden h-10 w-[28%] px-3 sm:table-cell">Collaboration</TableHead>
          <TableHead className="hidden h-10 w-24 px-3 lg:table-cell">Status</TableHead>
          <TableHead className="h-10 w-28 px-3">Updated</TableHead>
          <TableHead className="h-10 w-14 px-5 text-right">
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {studies.map((study) => (
          <TableRow
            className="cursor-pointer focus-within:bg-muted/50"
            key={study.id}
            onClick={(event) => {
              if (!(event.target as HTMLElement).closest("a, button")) {
                navigate(studyWorkspacePath(study.id));
              }
            }}
          >
            <TableCell className="px-5 py-3">
              <Link
                className="block truncate font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                to={studyWorkspacePath(study.id)}
              >
                {study.title}
              </Link>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground sm:hidden">{study.project_title}</span>
            </TableCell>
            <TableCell className="hidden truncate px-3 py-3 text-muted-foreground sm:table-cell">
              {study.project_title}
            </TableCell>
            <TableCell className="hidden px-3 py-3 lg:table-cell">
              <Badge className="font-normal" size="sm" variant="outline">
                {statusLabel(study.status)}
              </Badge>
            </TableCell>
            <TableCell className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatUpdatedAt(study.updated_at)}</TableCell>
            <TableCell className="px-5 py-3 text-right">
              <Button aria-label={`Open ${study.title}`} asChild className="size-8" size="icon" variant="ghost">
                <Link to={studyWorkspacePath(study.id)}>
                  <ArrowRight />
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RecentStudiesPanel() {
  const query = useRecentStudies();
  const studies = query.data?.results ?? [];

  return (
    <Card className="min-w-0 border-border/70 shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-4 border-b border-border/70 p-5">
        <div className="space-y-1">
          <CardTitle className="text-base">Recently updated studies</CardTitle>
          <p className="text-sm text-muted-foreground">Continue recent intake work or review study status.</p>
        </div>
        <Button asChild className="shrink-0" size="sm" variant="outline">
          <Link to={studiesIndexPath}>View all studies</Link>
        </Button>
      </CardHeader>

      {query.isLoading ? (
        <CardContent className="space-y-3 p-5" aria-live="polite">
          <p className="text-sm text-muted-foreground">Loading recent studies…</p>
          {[0, 1, 2].map((index) => (
            <Skeleton className="h-10 w-full" key={index} />
          ))}
        </CardContent>
      ) : null}

      {query.isError ? (
        <CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
          <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
            <RefreshCw className="size-4" />
          </div>
          <div>
            <p className="font-medium text-foreground">Recent studies couldn’t be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          </div>
          <Button size="sm" type="button" variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </CardContent>
      ) : null}

      {query.isSuccess && studies.length > 0 ? <RecentStudyTable studies={studies} /> : null}

      {query.isSuccess && studies.length === 0 ? (
        <CardContent className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
          <div className="flex size-11 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
            <FlaskConical className="size-5" />
          </div>
          <h2 className="mt-4 font-medium text-foreground">No studies yet</h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            Every study belongs to a collaboration. Choose an existing collaboration when creating a study, or create the
            collaboration first.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button asChild size="sm">
              <Link to={globalStudyCreatePath()}>Create study</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={collaborationCreatePath}>Create collaboration</Link>
            </Button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
