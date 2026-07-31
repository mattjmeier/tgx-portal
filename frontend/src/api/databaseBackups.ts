import type { PaginatedResponse } from "./projects";
import { apiFetch, parseErrorMessage } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export type DatabaseBackup = {
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  verification_status: "not_verified" | "running" | "passed" | "failed";
  filename: string;
  size_bytes: number | null;
  sha256: string;
  postgres_version: string;
  error_message: string;
  initiated_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  verified_at: string | null;
};

export async function fetchDatabaseBackups(): Promise<PaginatedResponse<DatabaseBackup>> {
  const response = await apiFetch(`${apiBaseUrl}/api/admin/database-backups/?page_size=100`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load database backups."));
  }
  return response.json();
}

export async function createDatabaseBackup(): Promise<DatabaseBackup> {
  const response = await apiFetch(`${apiBaseUrl}/api/admin/database-backups/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to start a database backup."));
  }
  return response.json();
}

export async function verifyDatabaseBackup(backupId: number): Promise<DatabaseBackup> {
  const response = await apiFetch(`${apiBaseUrl}/api/admin/database-backups/${backupId}/verify/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to start backup verification."));
  }
  return response.json();
}

export async function downloadDatabaseBackup(backupId: number): Promise<Blob> {
  const response = await apiFetch(`${apiBaseUrl}/api/admin/database-backups/${backupId}/download/`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to download the backup."));
  }
  return response.blob();
}
