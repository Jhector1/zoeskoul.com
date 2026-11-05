import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("TanStack opaque-frame capability transport", () => {
  it("generates a 192-bit random capability for every isolated lease", () => {
    const lifecycle = read("../services/build/tanstackPreviewSharedLifecycle.ts");
    expect(lifecycle).toContain('randomBytes(24).toString("base64url")');
    expect(lifecycle).toContain("/content/${publicAccessKey}/");
    expect(lifecycle).toContain("normalizeTanstackPreviewHttpRequest");
  });
  it("authenticates internal capability routes at the Runner service boundary", () => {
    const app = read("../app.ts");
    const guard = app.indexOf("app.use(requireServiceAuth)");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(app.indexOf('app.post("/build/previews/:previewId/proxy-fetch"'));
    expect(guard).toBeLessThan(app.indexOf('app.post("/build/previews/:previewId/resolve-capability"'));
  });
  it("keeps bearer capability read-only, separate from owner mutation transport", () => {
    const proxy = read("./build.previews.proxyFetch.ts");
    const resolve = read("./build.previews.resolveCapability.ts");
    const owned = read("./build.previews.fetch.ts");
    expect(proxy).toContain("fetchAdmittedTanstackPreview");
    expect(proxy).toContain('method !== "GET" && method !== "HEAD"');
    expect(proxy).not.toContain("getRequiredActorKey");
    expect(resolve).toContain("resolveAdmittedTanstackPreviewCapability");
    expect(resolve).not.toContain("getRequiredActorKey");
    expect(owned).toContain("fetchOwnedTanstackPreview");
    for (const route of [proxy, resolve, owned]) {
      expect(route).not.toContain("fetchReactPreviewHttpByCapability");
      expect(route).not.toContain("resolveReactPreviewContextByCapability");
    }
  });
  it("keeps TanStack sandbox isolated from network and published ports", () => {
    const runtime = read("../services/build/tanstackPreviewRuntimePolicy.ts");
    const driver = read("../services/build/tanstackPreviewDockerDriver.ts");
    expect(runtime).toContain("assertTanstackSandboxOptions");
    expect(driver).toContain('NetworkMode: "none"');
    expect(runtime).toContain("config.PortBindings !== undefined");
  });
});
