import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

import { AdminBackupsPage } from "./AdminBackupsPage";

const fetchDatabaseBackupsMock = vi.fn();
const createDatabaseBackupMock = vi.fn();
const verifyDatabaseBackupMock = vi.fn();
const downloadDatabaseBackupMock = vi.fn();

vi.mock("../api/databaseBackups", () => ({
  fetchDatabaseBackups: (...args: unknown[]) => fetchDatabaseBackupsMock(...args),
  createDatabaseBackup: (...args: unknown[]) => createDatabaseBackupMock(...args),
  verifyDatabaseBackup: (...args: unknown[]) => verifyDatabaseBackupMock(...args),
  downloadDatabaseBackup: (...args: unknown[]) => downloadDatabaseBackupMock(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminBackupsPage />
    </QueryClientProvider>,
  );
}

describe("AdminBackupsPage", () => {
  beforeEach(() => {
    fetchDatabaseBackupsMock.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 7,
          status: "completed",
          verification_status: "not_verified",
          filename: "tgx_portal_20260730.dump",
          size_bytes: 1024,
          sha256: "abc123",
          created_at: "2026-07-30T12:00:00Z",
          completed_at: "2026-07-30T12:01:00Z",
          verified_at: null,
          error_message: "",
        },
      ],
    });
    createDatabaseBackupMock.mockResolvedValue({ id: 8, status: "pending" });
    verifyDatabaseBackupMock.mockResolvedValue({ id: 7, verification_status: "running" });
    downloadDatabaseBackupMock.mockResolvedValue(new Blob(["backup"]));
  });

  afterEach(() => vi.clearAllMocks());

  it("creates, verifies, and exposes downloads without a live restore action", async () => {
    renderPage();

    expect(await screen.findByText("Database backups")).toBeInTheDocument();
    expect(await screen.findByText("tgx_portal_20260730.dump")).toBeInTheDocument();
    expect(screen.getByText(/--confirm-database tgx_portal/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /restore production/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create backup" }));
    await waitFor(() => expect(createDatabaseBackupMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() =>
      expect(verifyDatabaseBackupMock).toHaveBeenCalledWith(7, expect.anything()),
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(downloadDatabaseBackupMock).toHaveBeenCalledWith(7));
  });
});
