import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");

function read(relative: string) {
  return readFileSync(resolve(root, relative), "utf8");
}

describe("Public Challenge learner-facing Website origin", () => {
  it("uses one canonical server Website-origin helper for preview and share", () => {
    const helper = read("apps/web/src/lib/http/websiteOrigin.ts");
    const preview = read(
      "apps/web/src/app/api/practice/trial/preview/route.ts",
    );
    const share = read(
      "apps/web/src/app/api/practice/trial/share/route.ts",
    );

    expect(helper).toContain('getProductionAppOrigin("website")');
    expect(helper).toContain('args.vercelEnv === "preview"');

    expect(preview).toContain(
      'import { resolveRequestWebsiteOrigin } from "@/lib/http/websiteOrigin";',
    );
    expect(share).toContain(
      'import { resolveRequestWebsiteOrigin } from "@/lib/http/websiteOrigin";',
    );

    expect(preview).toContain("resolveRequestWebsiteOrigin(req)");
    expect(share).toContain("resolveRequestWebsiteOrigin(req)");

    expect(preview).not.toContain("function requestOrigin(");
    expect(share).not.toContain("function publicOrigin(");
    expect(preview).not.toContain("new URL(req.url).origin");
    expect(share).not.toContain("NEXT_PUBLIC_APP_URL");
  });

  it("keeps logout on the same canonical runtime-origin policy", () => {
    const logout = read(
      "apps/web/src/app/api/auth/logout/logoutWebsiteOrigin.ts",
    );

    expect(logout).toContain(
      'from "@/lib/http/websiteOrigin"',
    );
    expect(logout).toContain("resolveWebsiteOriginForRuntime(args)");
    expect(logout).not.toContain('getProductionAppOrigin("website")');
  });
});
