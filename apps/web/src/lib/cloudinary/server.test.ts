import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let validateChallengeOgImageFile: typeof import("./server").validateChallengeOgImageFile;
let signCloudinaryParams: typeof import("./server").signCloudinaryParams;

beforeAll(async () => {
  ({ validateChallengeOgImageFile, signCloudinaryParams } = await import("./server"));
});

describe("validateChallengeOgImageFile", () => {
  it("accepts supported images within the upload limit", () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "preview.jpg", {
      type: "image/jpeg",
    });

    expect(() => validateChallengeOgImageFile(file)).not.toThrow();
  });

  it("rejects unsupported files", () => {
    const file = new File(["not an image"], "preview.svg", {
      type: "image/svg+xml",
    });

    expect(() => validateChallengeOgImageFile(file)).toThrow(
      "Choose a JPEG, PNG, or WebP image.",
    );
  });

  it("rejects files larger than four megabytes", () => {
    const file = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "preview.png", {
      type: "image/png",
    });

    expect(() => validateChallengeOgImageFile(file)).toThrow(
      "The preview image must be 4 MB or smaller.",
    );
  });
});


describe("signCloudinaryParams", () => {
  it("uses Cloudinary-compatible SHA-256 signing", () => {
    expect(
      signCloudinaryParams({ timestamp: 1315060510 }, "abcd"),
    ).toBe(
      "5652e549a70bdc03f73a633a23b7d3f3b067d72fff26dd15b25997f46fdf6439",
    );
  });

  it("sorts every signed field and serializes booleans exactly as sent", () => {
    const signature = signCloudinaryParams(
      {
        unique_filename: true,
        timestamp: 1783527487,
        folder: "zoeskoul/challenges/og",
        use_filename: false,
        overwrite: false,
      },
      "test-secret",
    );

    expect(signature).toHaveLength(64);
  });
});
