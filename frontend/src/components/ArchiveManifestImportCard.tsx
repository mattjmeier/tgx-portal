import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, FileSearch } from "lucide-react";

import { applyArchiveManifest, previewArchiveManifest } from "../api/studyImports";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function ArchiveManifestImportCard() {
  const queryClient = useQueryClient();
  const [manifestPath, setManifestPath] = useState("");
  const previewMutation = useMutation({
    mutationFn: previewArchiveManifest,
  });
  const applyMutation = useMutation({
    mutationFn: applyArchiveManifest,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["studies"] }),
        queryClient.invalidateQueries({ queryKey: ["studies-index"] }),
      ]);
    },
  });
  const error = previewMutation.error ?? applyMutation.error;
  const preview = previewMutation.data;
  const applied = applyMutation.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Read-only archive import</CardTitle>
        <CardDescription>
          Validate and replay a portal-study.yaml descriptor already mounted beneath /data.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="archive-manifest-path">Manifest path</Label>
          <Input
            id="archive-manifest-path"
            aria-label="Manifest path"
            placeholder="/data/studies/example/portal-study.yaml"
            value={manifestPath}
            onChange={(event) => {
              setManifestPath(event.target.value);
              previewMutation.reset();
              applyMutation.reset();
            }}
          />
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Archive import failed</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        {preview ? (
          <Alert>
            <FileSearch />
            <AlertTitle>{preview.study_key}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col gap-2">
                <p>
                  {preview.artifact_count} artifacts · digest {preview.source_digest.slice(0, 12)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge>{preview.curation_status}</Badge>
                  <Badge variant={preview.outcome === "no_changes" ? "secondary" : "default"}>
                    {preview.outcome === "no_changes" ? "No changes" : "Changes detected"}
                  </Badge>
                  {preview.missing_artifacts.length ? (
                    <Badge variant="secondary">
                      Missing: {preview.missing_artifacts.join(", ")}
                    </Badge>
                  ) : null}
                </div>
                {Object.values(preview.stale ?? {}).flat().length ? (
                  <p>
                    Stale records retained:{" "}
                    {Object.entries(preview.stale)
                      .filter(([, values]) => values.length)
                      .map(([kind, values]) => `${kind} (${values.length})`)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {applied ? (
          <Alert>
            <ArchiveRestore />
            <AlertTitle>Archive import {applied.outcome}</AlertTitle>
            <AlertDescription>
              {applied.created} records created and {applied.updated} updated. Existing records absent from the
              descriptor were retained.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          disabled={!manifestPath.trim() || previewMutation.isPending}
          variant="outline"
          onClick={() => previewMutation.mutate(manifestPath.trim())}
        >
          <FileSearch data-icon="inline-start" />
          Preview archive import
        </Button>
        <Button
          disabled={!preview || applyMutation.isPending}
          onClick={() => applyMutation.mutate(manifestPath.trim())}
        >
          <ArchiveRestore data-icon="inline-start" />
          Apply archive import
        </Button>
      </CardFooter>
    </Card>
  );
}
