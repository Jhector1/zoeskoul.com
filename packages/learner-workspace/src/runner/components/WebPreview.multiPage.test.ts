import { describe, expect, it } from "vitest";

import { buildWebPreviewSrcDoc } from "./WebPreview";

describe("WebPreview multi-page virtual website", () => {
  it("marks internal html links for host-owned virtual navigation", () => {
    const html = buildWebPreviewSrcDoc(
      [
        { kind: "file", path: "index.html", content: '<a href="about.html">About</a>' },
        { kind: "file", path: "about.html", content: '<a href="index.html">Home</a>' },
      ] as any,
      "index.html",
    );

    expect(html).toContain('data-zoeskoul-preview-path="/about.html"');
    expect(html).toContain("zoeskoul-web-preview:navigate");
  });

  it("resolves parent-folder links from a nested html page", () => {
    const html = buildWebPreviewSrcDoc(
      [
        { kind: "file", path: "index.html", content: "<h1>Home</h1>" },
        { kind: "file", path: "projects/robotics.html", content: '<a href="../index.html">Back</a>' },
      ] as any,
      "projects/robotics.html",
    );

    expect(html).toContain('data-zoeskoul-preview-path="/index.html"');
  });

  it("keeps binary image assets available on secondary pages", () => {
    const html = buildWebPreviewSrcDoc(
      [
        { kind: "file", path: "index.html", content: "<h1>Home</h1>" },
        { kind: "file", path: "about.html", content: '<img src="images/profile.png" alt="Profile">' },
        {
          kind: "file",
          path: "images/profile.png",
          content: "",
          encoding: "base64",
          data: "AAECAw==",
          mimeType: "image/png",
          sizeBytes: 4,
        },
      ] as any,
      "about.html",
    );

    expect(html).toContain("data:image/png;base64,AAECAw==");
  });
});
