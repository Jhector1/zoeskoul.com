import { describe, expect, it } from "vitest";

import { normalizeWebPreviewNavigationPath } from "./WebPreview";

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
