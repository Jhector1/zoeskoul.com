import { fileURLToPath as ownerTestFileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const routePath = resolve(
  ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)),
  "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/source/route.ts",
);

describe("ZoeBuild source-save HTTP boundary", () => {
  it("keeps transport/auth/rate/validation ahead of the mutation command", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain('import { enforceBuildMutationOrigin } from "@/lib/server/enforceBuildMutationOrigin"');
    const patch = source.slice(source.indexOf("export async function PATCH("));
    const ordered = [
      "if (!enforceBuildMutationOrigin(req))",
      "exceedsContentLength(req, MAX_BUILD_SOURCE_BODY_BYTES)",
      "loadCurrentBuildAccessSnapshot(req,{requireAuthority:true})",
      "await rateLimit(",
      "if (!limited.ok)",
      "await readJsonSafe(req)",
      "parseBuildWorkspaceMutation(body.workspace)",
      "await saveBuildProjectSourceCommand({",
    ].map(marker => patch.indexOf(marker));
    expect(ordered.every((position, i) => position >= 0 && (i === 0 || position > ordered[i - 1]!))).toBe(true);
    expect(patch.slice(ordered[0], ordered[1])).toContain("403");
    expect(source).toContain("exceedsContentLength(req, MAX_BUILD_SOURCE_BODY_BYTES)");
    expect(source).toContain("loadCurrentBuildAccessSnapshot(req,{requireAuthority:true})");
    expect(source).toContain('bucket: "zoebuild-source-save"');
    expect(source).toContain("parseBuildWorkspaceMutation(body.workspace)");
    expect(source).toContain("saveBuildProjectSourceCommand({");
    expect(source).toContain("createPrismaBuildProjectSourceWriter(prisma)");

    expect(source).not.toContain("prisma.codeProject.update");
    expect(source).not.toContain("prisma.codeProjectRevision.create");
  });

  it("exposes optimistic concurrency instead of last-write-wins", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("baseVersion");
    expect(source).toContain("BuildSourceConflictError");
    expect(source).toContain("409");
    expect(source).toContain("conflict: error.conflict");
  });

  it("does not introduce execution or provider calls", () => {
    const source = readFileSync(routePath, "utf8").toLowerCase();

    expect(source).not.toContain("cloudflare");
    expect(source).not.toContain("neon");
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("docker");
    expect(source).not.toContain("openai");
    expect(source).not.toContain("judge0");
  });
});

// These checks are intentionally independent of the disposable database suite.
describe("source-save configured origin policy", () => {
  afterEach(() => vi.unstubAllEnvs());
  const origin = "http://localhost:3004";
  const req = (headers: Record<string, string> = {}, target = origin + "/api/build/projects/demo/source") =>
    new Request(target, { method: "PATCH", headers });
  it.each(["test", "production"])("requires the configured origin in %s", async (mode) => {
    vi.stubEnv("NODE_ENV", mode);
    vi.stubEnv("APP_ORIGIN", origin);
    const { enforceBuildMutationOrigin: check } = await import("../server/enforceBuildMutationOrigin");
    expect(check(req({ origin }))).toBe(true);
    expect(check(req({ referer: origin + "/editor" }))).toBe(true);
    expect(check(req({ origin: "https://untrusted.invalid", referer: origin + "/editor" }))).toBe(false);
    expect(check(req({ origin: "null" }))).toBe(false);
    expect(check(req({ origin: "http://localhost:3005" }))).toBe(false);
    expect(check(req())).toBe(false);
    expect(check(req({ referer: "not a URL" }))).toBe(false);
  });
  it("fails closed in production without configured origin and limits development fallback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", undefined);
    const { enforceBuildMutationOrigin: check } = await import("../server/enforceBuildMutationOrigin");
    expect(check(req({ origin }))).toBe(false);
    vi.stubEnv("NODE_ENV", "test");
    expect(check(req({ origin }))).toBe(true);
    expect(check(req({ origin: "https://untrusted.invalid" }, "https://untrusted.invalid/api"))).toBe(false);
    expect(check(req({ origin: "https://untrusted.invalid", "x-forwarded-host": "untrusted.invalid" }))).toBe(false);
    vi.stubEnv("APP_ORIGIN", "not a URL");
    expect(check(req({ origin }))).toBe(false);
  });
});
