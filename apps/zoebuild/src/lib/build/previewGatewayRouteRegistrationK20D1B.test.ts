import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const app = path.resolve(process.cwd(), "src/app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]");
const route = (relative: string) => path.join(app, relative);

describe("K20D1B preview gateway route registration", () => {
  it("exposes the synthetic document as a Next.js-safe dedicated static route", () => {
    const dedicated = route("preview-document/route.ts");
    expect(existsSync(route("%5F%5Fzoebuild/document/route.ts"))).toBe(false);
    expect(existsSync(route("__zoebuild/document/route.ts"))).toBe(false);
    expect(existsSync(dedicated)).toBe(true);
    const source = readFileSync(dedicated, "utf8");
    expect(source).toContain('GET as readCapabilityDocument');
    expect(source).toContain('HEAD as headCapabilityDocument');
    expect(source).toContain('"../[...path]/route"');
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).not.toContain('proxyFetchTrustedReactPreviewAtRunner');
    expect(source).not.toContain('RUNNER_BASE_URL');
  });

  it("uses a required catch-all for assets and commerce rather than a second optional root", () => {
    const canonical = route("[...path]/route.ts");
    expect(existsSync(canonical)).toBe(true);
    expect(existsSync(route("[[...path]]/route.ts"))).toBe(false);
    const source = readFileSync(canonical, "utf8");
    expect(source).toContain("proxyFetchTrustedReactPreviewAtRunner");
    expect(source).toContain("parseReactPreviewDocumentRequest");
    expect(source).toContain("normalizeReactPreviewProxyPath");
    expect(source).toContain('if (!validCapability(capability))');
    expect(source).toContain('export async function POST(');
  });
});
