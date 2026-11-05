import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "src/app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]");
const gateway = readFileSync(resolve(root, "[...path]/route.ts"), "utf8");
const documentRoute = readFileSync(resolve(root, "%5F%5Fzoebuild/document/route.ts"), "utf8");

describe("K20D3J1 migrated preview HEAD recovery contract", () => {
  it("preserves GET/HEAD handlers and protected document target validation", () => {
    expect(gateway).toContain('export async function GET(');
    expect(gateway).toContain('export async function HEAD(');
    expect(gateway).toContain('return proxy(req, ctx, "HEAD")');
    expect(gateway).toContain('const documentGateway = documentTarget.isDocumentGateway;');
    expect(gateway).toContain('parseReactPreviewDocumentRequest(url) === null');
    expect(gateway).not.toContain('if (documentGateway && method !== "GET")');
    expect(gateway).toContain('proxyFetchTrustedReactPreviewAtRunner({');
    expect(gateway).toContain('path: documentGateway ? basePath : `${normalizedPathname}${url.search}`');
  });
  it("retains upstream failure classification and bodyless HEAD", () => {
    expect(gateway).toContain('"X-ZoeBuild-Preview-Failure", "runner-http-404"');
    expect(gateway).toContain('"X-ZoeBuild-Preview-Failure", "runner-root-404"');
    expect(gateway).toContain('method === "HEAD"');
    expect(gateway).toContain('return new Response(body, { status: result.status, headers });');
    expect(documentRoute).toMatch(/\bGET\b/);
    expect(documentRoute).toMatch(/\bHEAD\b/);
  });
});
