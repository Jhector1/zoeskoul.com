import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BuildPlanRequestError,
  parseBuildPlanFormData,
} from "./buildPlanMedia";

describe("ZoeBuild multipart AI plan input", () => {
  it("accepts media-only prompts", async () => {
    const form = new FormData();
    form.append(
      "media",
      new File(
        [new Uint8Array([1, 2, 3])],
        "reference.png",
        { type: "image/png" },
      ),
    );

    const parsed = await parseBuildPlanFormData(form);

    expect(parsed.prompt).toBe("");
    expect(parsed.media).toHaveLength(1);
    expect(parsed.media[0]).toMatchObject({
      kind: "image",
      mimeType: "image/png",
      name: "reference.png",
      source: {
        type: "base64",
      },
    });
  });

  it("rejects unsupported files", async () => {
    const form = new FormData();
    form.append(
      "media",
      new File(
        ["hello"],
        "notes.txt",
        { type: "text/plain" },
      ),
    );

    await expect(
      parseBuildPlanFormData(form),
    ).rejects.toBeInstanceOf(
      BuildPlanRequestError,
    );
  });

  it("accepts image audio and video MIME families", async () => {
    const form = new FormData();

    for (const [name, type] of [
      ["image.png", "image/png"],
      ["voice.webm", "audio/webm"],
      ["clip.mp4", "video/mp4"],
    ] as const) {
      form.append(
        "media",
        new File(["x"], name, { type }),
      );
    }

    const parsed = await parseBuildPlanFormData(form);

    expect(
      parsed.media.map((item) => item.kind),
    ).toEqual([
      "image",
      "audio",
      "video",
    ]);
  });
});
