import { downloadStudyGeoMetadataCsv } from "./studies";

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
