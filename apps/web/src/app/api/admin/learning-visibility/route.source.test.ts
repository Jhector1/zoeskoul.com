import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const compat = readFileSync(new URL("../../../(admin)/admin/learning-visibility/page.tsx", import.meta.url), "utf8");

describe("Learning visibility backend and Admin app boundary", () => {
  it("uses server authorization and CORS on GET, PATCH and preflight", () => {
    expect(source).toContain("export async function GET(");
    expect(source).toContain("export async function PATCH(");
    expect(source).toContain("export async function OPTIONS(");
    expect(source.match(/await requireAdmin\(req\)/g)).toHaveLength(2);
    expect(source).toContain("isAppMutationOriginAllowed(req)");
    expect(source).toContain("appCorsPreflight(req)");
    expect(source).toContain("applyAppCorsHeaders(req, denied)");
  });
  it("keeps reconciliation read-only and website UI as a redirect", () => {
    expect(source).toContain("reconcileManifestAndDatabase(");
    expect(compat).toContain('getLocalAppOrigin("admin")');
    expect(compat).toContain('redirect(new URL("/learning-visibility", origin)');
  });
});
