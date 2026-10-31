import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("K20D3H automatic confirmed-expiry recovery", () => {
  it("uses the exact protected document HEAD gateway, never a public Vite port", () => {
    const preview = readFileSync(resolve(__dirname, "../../../../../",
      "packages/learner-workspace/src/runner/components/RemoteWebPreview.tsx"), "utf8");
    expect(preview).toContain('method: "HEAD", cache: "no-store", credentials: "same-origin"');
    expect(preview).toContain('response.headers.get("x-zoebuild-preview-failure") !== "runner-http-404"');
    expect(preview).toContain("automaticExpiryRecoveryRef.current >= 1");
    expect(preview).toContain("automaticExpiryRecoveryRef.current = 0");
    expect(preview).toContain("preview.onRetry?.()");
    expect(preview).not.toContain('http://localhost:5173');
  });

  it("preserves the existing protected HEAD route and no-public-port sandbox", () => {
    const route = readFileSync(resolve(__dirname, "../../..",
      "src/app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/%5F%5Fzoebuild/document/route.ts"), "utf8");
    expect(route).toContain("export async function HEAD(");
    expect(route).toContain("headCapabilityDocument(request, context)");
  });
});
