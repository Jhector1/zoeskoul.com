import { describe, expect, it } from "vitest";
import { TANSTACK_START_TEMPLATE_V1 } from "./tanstackStartTemplate";
import { getBuildTemplate } from "./index";

const files = new Map<string, string>(TANSTACK_START_TEMPLATE_V1.files.map(file => [file.path, file.content]));

describe("canonical TanStack Start generated app blueprint", () => {
  it("uses one full-stack TanStack Start entrypoint and file-based routing", () => {
    expect(TANSTACK_START_TEMPLATE_V1.id).toBe("tanstack-start-v1");
    expect(new Set(files.keys()).size).toBe(TANSTACK_START_TEMPLATE_V1.files.length);
    expect(files.get("src/router.tsx")).toContain("createRouter");
    expect(files.get("src/routes/__root.tsx")).toContain("HeadContent");
    expect(files.get("src/routes/__root.tsx")).toContain("Scripts");
    expect(files.get("src/routes/index.tsx")).toContain('createFileRoute("/")');
    expect(files.get("src/routes/about.tsx")).toContain('createFileRoute("/about")');
    expect(files.has("index.html")).toBe(false);
    expect(files.has("src/main.tsx")).toBe(false);
    expect(files.has("src/routes/AppRoutes.tsx")).toBe(false);
    expect(getBuildTemplate(TANSTACK_START_TEMPLATE_V1.id)).toBe(TANSTACK_START_TEMPLATE_V1);
  });

  it("implements actual server functions, server routes and SSR metadata", () => {
    expect(files.get("src/functions/siteInfo.functions.ts")).toContain("createServerFn");
    expect(files.get("src/server/siteInfo.server.ts")).toContain("getPublicSiteInfo");
    expect(files.get("src/routes/api.health.ts")).toContain("handlers:");
    expect(files.get("src/routes/__root.tsx")).toContain("name: \"description\"");
    expect(files.get("src/routes/index.tsx")).toContain("loader:");
  });

  it("retains a single shared header and footer", () => {
    const shell = files.get("src/layouts/SiteLayout.tsx") ?? "";
    expect(shell).toContain("<SiteHeader />");
    expect(shell).toContain("<SiteFooter />");
    expect((shell.match(/<SiteHeader \/>/g) ?? []).length).toBe(1);
    expect((shell.match(/<SiteFooter \/>/g) ?? []).length).toBe(1);
  });

  it("pins every generated package to an exact version for the existing approval gate", () => {
    const packageJson = JSON.parse(files.get("package.json") ?? "{}");
    expect(packageJson.packageManager).toBe("pnpm@10.33.0");
    expect(packageJson.devDependencies.wrangler).toBe("4.156.1");
    const exact = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
    for (const group of [packageJson.dependencies, packageJson.devDependencies]) {
      for (const version of Object.values(group)) {
        expect(typeof version).toBe("string");
        expect(version).toMatch(exact);
      }
    }
  });

  it("uses Cloudflare Workers without exposing ZoeBuild platform credentials", () => {
    const packageJson = JSON.parse(files.get("package.json") ?? "{}");
    expect(packageJson.dependencies["@tanstack/react-start"]).toBeTruthy();
    expect(packageJson.dependencies["@tanstack/react-router"]).toBeTruthy();
    expect(packageJson.dependencies["react-router"]).toBeUndefined();
    expect(packageJson.scripts.deploy).toBeUndefined();
    expect(files.get("vite.config.ts")).toContain("@cloudflare/vite-plugin");
    expect(files.get("wrangler.jsonc")).toContain('"nodejs_compat"');
    const all = [...files.values()].join("\n");
    expect(all).not.toMatch(/ZOEBUILD_DEPENDENCY_APPROVAL_SECRET|WEB_DATABASE_URL|ADMIN_DATABASE_URL/);
  });
});
