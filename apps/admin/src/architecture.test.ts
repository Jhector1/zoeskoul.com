import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
    return [full];
  });
}

describe("Admin browser application boundary", () => {
  it("is Vite-only and does not carry server/database dependencies", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(pkg.scripts.dev).toBe("vite");
    expect(pkg.scripts.build).toContain("vite build");
    expect(pkg.devDependencies.vite).toBeTruthy();

    for (const forbidden of [
      "next",
      "@zoeskoul/db",
      "@prisma/client",
      "@prisma/adapter-pg",
      "pg",
    ]) {
      expect(pkg.dependencies[forbidden]).toBeUndefined();
    }
  });

  it("contains no Next, Prisma, DB, or server-secret imports", () => {
    const combined = sourceFiles(src)
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");

    for (const forbidden of [
      'from "next',
      "next/server",
      "next/navigation",
      "@zoeskoul/db",
      "@prisma/client",
      "PrismaClient",
      "DATABASE_URL",
      "STRIPE_SECRET",
      "process.env.NEXT_PUBLIC",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it("keeps curriculum message resolution outside the Vite Admin", () => {
    const combined = sourceFiles(src)
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");

    expect(combined).not.toContain("isTaggedKey");
    expect(combined).not.toContain("stripTag");
    expect(combined).not.toContain("resolveDeepTagged");
    expect(combined).not.toContain("loadCurriculumLocaleMessages");
    expect(combined).not.toContain("messages.generated");
  });

  it("reuses shared auth and API behavior", () => {
    const access = fs.readFileSync(
      path.join(src, "app/AdminAccessGate.tsx"),
      "utf8",
    );
    const api = fs.readFileSync(
      path.join(src, "lib/adminApi.ts"),
      "utf8",
    );

    expect(access).toContain(
      'from "@zoeskoul/auth-client/react"',
    );
    expect(access).toContain("buildAuthenticateUrl");
    expect(access).toContain('"admin:access"');
    expect(api).toContain(
      'from "@zoeskoul/api-client"',
    );
  });

  it("keeps presentation CSS-owned instead of rebuilding inline-style islands", () => {
    const publisherPath = path.join(
      src,
      "features/public-challenges/PublicChallengePublisher.tsx",
    );

    const featureSourcesOutsidePublisher = sourceFiles(
      path.join(src, "features"),
    )
      .filter((file) => file !== publisherPath)
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");

    // Preserve the pre-existing Admin-wide budget. Moving Public Challenges
    // must not grant every feature another inline-style island.
    expect(
      featureSourcesOutsidePublisher.match(/style=\{\{/g) ?? [],
    ).toHaveLength(1);

    const publisher = fs.readFileSync(publisherPath, "utf8");

    // The legacy publisher currently needs at most one runtime-bound inline
    // style. Static presentation remains utility/CSS-owned.
    expect(
      (publisher.match(/style=\{\{/g) ?? []).length,
    ).toBeLessThanOrEqual(1);
  });

  it("public challenge access remains server-authoritative", () => {
    const gate = fs.readFileSync(
      path.join(src, "app/AdminAccessGate.tsx"),
      "utf8",
    );
    const publisher = fs.readFileSync(
      path.join(
        src,
        "features/public-challenges/PublicChallengePublisher.tsx",
      ),
      "utf8",
    );

    expect(gate).toContain("/api/admin/public-challenges");
    expect(gate).toContain('"admin:access"');
    expect(gate).toContain('from "@/lib/adminApi"');
    expect(gate).toContain("adminFetch(");
    expect(gate).not.toContain('"publisher"');
    expect(gate).not.toContain('"author"');
    expect(publisher).toContain(
      'from "@zoeskoul/api-contracts"',
    );
    expect(publisher).toContain('from "@/lib/adminApi"');
  });

});
