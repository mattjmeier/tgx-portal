import { createSamplesBulk, BulkSampleImportError, type CreateSamplePayload } from "./samples";

describe("createSamplesBulk", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves field-level row errors from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => [
          {},
          {
            sample_ID: ["sample_ID may only contain letters, numbers, hyphens, and underscores."],
            dose: ["Input should be greater than or equal to 0"],
          },
        ],
      }),
    );

    const payload: CreateSamplePayload[] = [
      {
        study: 1,
        sample_ID: "sample-1",
        sample_name: "Sample 1",
        description: "",
        group: "control",
        chemical: "",
        chemical_longname: "",
        dose: 0,
        technical_control: false,
        reference_rna: false,
        solvent_control: true,
      },
      {
        study: 1,
        sample_ID: "bad sample",
        sample_name: "Sample 2",
        description: "",
        group: "treated",
        chemical: "",
        chemical_longname: "",
        dose: -1,
        technical_control: false,
        reference_rna: false,
        solvent_control: false,
      },
    ];

    await expect(createSamplesBulk(payload)).rejects.toMatchObject({
      name: "BulkSampleImportError",
      rowErrors: [
        {
          rowNumber: 3,
          message:
            "sample_ID: sample_ID may only contain letters, numbers, hyphens, and underscores. | dose: Input should be greater than or equal to 0",
          fieldErrors: {
            sample_ID: ["sample_ID may only contain letters, numbers, hyphens, and underscores."],
            dose: ["Input should be greater than or equal to 0"],
          },
        },
      ],
    } satisfies Partial<BulkSampleImportError>);
  });
});
