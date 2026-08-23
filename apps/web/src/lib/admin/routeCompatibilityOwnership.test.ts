import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");

const routeConfigNames = [
  "runtime",
  "dynamic",
  "revalidate",
  "maxDuration",
  "preferredRegion",
] as const;

function routeFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory).flatMap((entry) => {
    const full = resolve(directory, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      return routeFiles(full);
    }

    return entry === "route.ts" ? [full] : [];
  });
}

describe("Next-safe compatibility route aliases", () => {
  const compatibilityRoots = [
    "apps/web/src/app/api/dev/curriculum-drafts",
    "apps/web/src/app/api/admin/course-assignments",
    "apps/web/src/app/api/admin/learning-groups",
    "apps/web/src/app/api/admin/tutoring-sessions",
  ];

  it("never re-exports route-segment config", () => {
    const routes = compatibilityRoots.flatMap((relative) =>
      routeFiles(resolve(root, relative)),
    );

    expect(routes.length).toBeGreaterThan(0);

    for (const route of routes) {
      const source = readFileSync(route, "utf8");

      for (const name of routeConfigNames) {
        const reexport = new RegExp(
          `export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`,
          "m",
        );

        expect(
          reexport.test(source),
          `${route} illegally re-exports ${name}`,
        ).toBe(false);
      }
    }
  });

  it("keeps product runtime callers on the canonical draft API", () => {
    const source = readFileSync(
      resolve(root, "apps/web/src/lib/practice/clientApi.ts"),
      "utf8",
    );

    expect(source).toContain("/api/admin/curriculum-drafts");
    expect(source).not.toContain("/api/dev/curriculum-drafts");
  });

  it("keeps the old draft namespace compatibility-only", () => {
    const routes = routeFiles(
      resolve(root, "apps/web/src/app/api/dev/curriculum-drafts"),
    );

    expect(routes.length).toBeGreaterThan(0);

    for (const route of routes) {
      const source = readFileSync(route, "utf8");

      expect(source).toContain("Compatibility alias only");
      expect(source).toContain(
        "@/app/api/admin/curriculum-drafts",
      );
    }
  });
});
