import { downloadStudyGeoMetadataCsv, syncStudyToPlane } from "./studies";

describe("downloadStudyGeoMetadataCsv", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the CSV blob and attachment filename", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("library name\nsample-1\n", {
          status: 200,
          headers: {
            "Content-Disposition": 'attachment; filename="geo_metadata_study.csv"',
          },
        }),
      ),
    );

    const result = await downloadStudyGeoMetadataCsv(11);

    expect(await result.blob.text()).toBe("library name\nsample-1\n");
    expect(result.filename).toBe("geo_metadata_study.csv");
  });
});

describe("syncStudyToPlane", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the study Plane sync endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          plane_sync: {
            status: "pending",
            attempt_count: 1,
            last_error: "",
            plane_work_item_id: "",
            plane_work_item_url: "",
            updated_at: "2026-04-30T12:00:00Z",
          },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncStudyToPlane(11);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/studies/11/sync-plane/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.plane_sync.status).toBe("pending");
  });

  it("uses the API error message when Plane sync is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Finalize study onboarding before sending the study to Plane." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(syncStudyToPlane(11)).rejects.toThrow(/finalize study onboarding/i);
  });
});
