import { describe, expect, it } from "vitest";

import {
  normalizeWebPreviewNavigationPath,
  resolveWebPreviewHtmlPath,
} from "./WebPreview";

describe("WebPreview host navigation path normalization", () => {
  it("removes the leading slash emitted by the iframe navigation bridge", () => {
    expect(normalizeWebPreviewNavigationPath("/about.html")).toBe("about.html");
    expect(
      normalizeWebPreviewNavigationPath("/projects/robotics.html"),
    ).toBe("projects/robotics.html");
    expect(normalizeWebPreviewNavigationPath("/index.html")).toBe("index.html");
  });

  it("keeps already-canonical workspace paths unchanged", () => {
    expect(normalizeWebPreviewNavigationPath("about.html")).toBe("about.html");
    expect(
      normalizeWebPreviewNavigationPath("projects/robotics.html"),
    ).toBe("projects/robotics.html");
  });

  it("normalizes repeated leading slashes defensively", () => {
    expect(normalizeWebPreviewNavigationPath("///about.html")).toBe("about.html");
  });
});

describe("WebPreview static clean-route resolution", () => {
  const htmlPaths = [
    "index.html",
    "about.html",
    "shop/index.html",
    "projects/robotics.html",
  ];

  it("matches the published static candidate order", () => {
    expect(resolveWebPreviewHtmlPath(htmlPaths, "/")).toBe("index.html");
    expect(resolveWebPreviewHtmlPath(htmlPaths, "/about")).toBe("about.html");
    expect(resolveWebPreviewHtmlPath(htmlPaths, "/shop")).toBe("shop/index.html");
    expect(
      resolveWebPreviewHtmlPath(htmlPaths, "/projects/robotics"),
    ).toBe("projects/robotics.html");
  });

  it("keeps explicit HTML paths canonical", () => {
    expect(resolveWebPreviewHtmlPath(htmlPaths, "/about.html")).toBe(
      "about.html",
    );
  });

  it("matches published HTML fallback for missing clean routes", () => {
    expect(resolveWebPreviewHtmlPath(htmlPaths, "/missing")).toBe("index.html");
  });
});
