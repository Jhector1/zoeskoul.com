import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "packages/learner-workspace/src/runner/components/WebPreview.tsx",
  ),
  "utf8",
);

describe("WebPreview expected-result navigation ownership", () => {
  it("treats entryPath as an initial/fallback page rather than a controlled route", () => {
    expect(source).toContain("entryPath?: string");
    expect(source).toContain(
      'const preferredEntryPath = normalizePath(props.entryPath ?? "");',
    );
    expect(source).toContain("if (htmlPaths.includes(virtualPath)) return;");
    expect(source).not.toContain(
      "current === preferredEntryPath ? current : preferredEntryPath",
    );
  });

  it("keeps virtual navigation in the shared preview", () => {
    expect(source).toContain(
      'if (data?.type !== "zoeskoul-web-preview:navigate") return;',
    );
    expect(source).toContain("setVirtualPath(path);");
    expect(source).toContain(
      "buildWebPreviewSrcDoc(props.entries, virtualPath)",
    );
  });
});
