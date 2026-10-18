import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../../..");

function read(relative: string) {
  return readFileSync(resolve(repo, relative), "utf8");
}

describe("ZoeBuild opaque-origin React preview module transport", () => {
  it("makes capability content CORS-readable to a sandboxed opaque iframe", () => {
    const route = read(
      "src/app/api/build/projects/[buildProjectId]/preview/" +
        "[previewId]/content/[capability]/[[...path]]/route.ts",
    );

    expect(route).toContain(
      'headers.set("Access-Control-Allow-Origin", "*")',
    );
    expect(route).toContain(
      'headers.set("Cross-Origin-Resource-Policy", "cross-origin")',
    );
    expect(route).toContain(
      '"Access-Control-Allow-Origin": "*"',
    );
  });

  it("preserves capability-only path validation", () => {
    const route = read(
      "src/app/api/build/projects/[buildProjectId]/preview/" +
        "[previewId]/content/[capability]/[[...path]]/route.ts",
    );

    expect(route).toContain(
      "normalizeReactPreviewProxyPath({",
    );
    expect(route).toContain(
      "validCapability(capability)",
    );
    expect(route).toContain(
      'return /^[A-Za-z0-9_-]{32}$/.test(value);',
    );
  });

  it("does not weaken the shared remote iframe with allow-same-origin", () => {
    const remote = read(
      "../../packages/learner-workspace/src/runner/components/" +
        "RemoteWebPreview.tsx",
    );

    expect(remote).toContain("sandbox=");
    expect(remote).not.toContain("allow-same-origin");
  });
});
