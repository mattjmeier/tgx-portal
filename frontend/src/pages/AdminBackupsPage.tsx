import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";

import {
  createDatabaseBackup,
  downloadDatabaseBackup,
  fetchDatabaseBackups,
  verifyDatabaseBackup,
  type DatabaseBackup,
} from "../api/databaseBackups";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

function formatBytes(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function statusVariant(status: DatabaseBackup["status"] | DatabaseBackup["verification_status"]) {
  return status === "failed" ? "outline" : status === "completed" || status === "passed" ? "default" : "secondary";
}

export function AdminBackupsPage() {
  const queryClient = useQueryClient();
  const backupsQuery = useQuery({
    queryKey: ["database-backups"],
    queryFn: fetchDatabaseBackups,
    refetchInterval: (query) => {
      const backups = query.state.data?.results ?? [];
      return backups.some(
        (backup) => backup.status === "pending" || backup.status === "running" || backup.verification_status === "running",
      )
        ? 3000
        : false;
    },
  });

  const createMutation = useMutation({
    mutationFn: createDatabaseBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["database-backups"] });
    },
  });
  const verifyMutation = useMutation({
    mutationFn: verifyDatabaseBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["database-backups"] });
    },
  });
  const downloadMutation = useMutation({
    mutationFn: async (backup: DatabaseBackup) => ({
      backup,
      blob: await downloadDatabaseBackup(backup.id),
    }),
    onSuccess: ({ backup, blob }) => {
      if (typeof URL.createObjectURL !== "function") {
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = backup.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });

  const error =
    backupsQuery.error ?? createMutation.error ?? verifyMutation.error ?? downloadMutation.error;
  const latestCompleted = backupsQuery.data?.results.find(
    (backup) => backup.status === "completed",
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Administration</p>
        <h2 className="text-3xl font-semibold tracking-tight">Database backups</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Create portable PostgreSQL exports, verify them in a disposable database, and download completed artifacts.
        </p>
      </div>

      <Alert>
        <ShieldCheck />
        <AlertTitle>Production restoration remains CLI-only</AlertTitle>
        <AlertDescription>
          The portal verifies backups without touching the active database. Follow the documented maintenance runbook
          and use the guarded database_restore management command for a live recovery.
          {latestCompleted ? (
            <code className="mt-2 block overflow-x-auto rounded bg-muted p-2 text-xs">
              docker compose -f docker-compose.prod.yml --profile ops run --rm backup python manage.py database_restore
              {" "}/backups/{latestCompleted.filename} --target-database tgx_portal --replace-live
              {" "}--confirm-database tgx_portal
            </code>
          ) : null}
        </AlertDescription>
      </Alert>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Backup operation failed</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Backup history</CardTitle>
          <CardDescription>
            Backup files are written to the configured mounted backup volume.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artifact</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backupsQuery.data?.results.map((backup) => (
                <TableRow key={backup.id}>
                  <TableCell className="font-medium">{backup.filename || `Backup ${backup.id}`}</TableCell>
                  <TableCell>{formatDate(backup.created_at)}</TableCell>
                  <TableCell>{formatBytes(backup.size_bytes)}</TableCell>
                  <TableCell>
                    <Badge
                      className={backup.status === "failed" ? "border-destructive text-destructive" : undefined}
                      variant={statusVariant(backup.status)}
                    >
                      {backup.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        backup.verification_status === "failed"
                          ? "border-destructive text-destructive"
                          : undefined
                      }
                      variant={statusVariant(backup.verification_status)}
                    >
                      {backup.verification_status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        disabled={backup.status !== "completed" || verifyMutation.isPending}
                        size="sm"
                        variant="outline"
                        onClick={() => verifyMutation.mutate(backup.id)}
                      >
                        <RefreshCw data-icon="inline-start" />
                        Verify
                      </Button>
                      <Button
                        disabled={backup.status !== "completed" || downloadMutation.isPending}
                        size="sm"
                        variant="outline"
                        onClick={() => downloadMutation.mutate(backup)}
                      >
                        <Download data-icon="inline-start" />
                        Download
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!backupsQuery.isLoading && (backupsQuery.data?.results.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={6}>
                    No backups have been created yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="justify-between">
          <p className="text-sm text-muted-foreground">
            {backupsQuery.isLoading ? "Loading backup history…" : `${backupsQuery.data?.count ?? 0} backup records`}
          </p>
          <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
            Create backup
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
