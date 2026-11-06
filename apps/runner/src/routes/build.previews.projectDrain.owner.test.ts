import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("TanStack-only project deletion drain boundary", () => {
  it("requires service authentication, server actor, and exact owner-bound release", () => {
    const app = read("../app.ts");
    const route = read("./build.previews.projectDrain.ts");
    expect(app.indexOf("app.use(requireServiceAuth)")).toBeGreaterThan(-1);
    expect(app.indexOf("app.use(requireServiceAuth)")).toBeLessThan(app.indexOf('/build/previews/project/drain'));
    expect(route).toContain("getRequiredActorKey(req)");
    expect(route).toContain("drainTanstackProjectPreviews");
    expect(route).toContain("releaseTanstackProjectPreviewDrain");
    expect(route).not.toContain("reactPreviewRuntime");
    expect(route).not.toContain("req.body.actorKey");
  });
  it("uses the one Runner project drain gate, and never frees a failed cleanup", () => {
    const drain = read("../services/build/tanstackPreviewProjectDrain.ts");
    const lifecycle = read("../services/build/tanstackPreviewSharedLifecycle.ts");
    const leases = read("../services/build/sharedPreviewRegistry.ts");
    expect(lifecycle).toContain("sharedPreviewProjectDrains.beginStart");
    expect(drain).toContain("sharedPreviewProjectDrains.beginDrain");
    expect(drain).toContain("sharedFullStackPreviews.drain");
    expect(drain).toContain("sharedPreviewProjectDrains.releaseDrain");
    expect(leases.indexOf("await lease.close();")).toBeLessThan(leases.indexOf("this.live.delete(id);"));
    expect(leases).toContain("this.closing.set(id, marker)");
  });
});
