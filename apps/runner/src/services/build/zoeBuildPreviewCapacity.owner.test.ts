import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");

describe("TanStack-only preview capacity ownership", () => {
  it("authorizes the exact saved revision and reserves through the canonical admission queue", () => {
    const lifecycle = read("src/services/build/tanstackPreviewSharedLifecycle.ts");
    const coordinator = lifecycle.indexOf("sharedPreviewStartCoordinator.run(");
    const authorize = lifecycle.indexOf("await input.authorize(ownerKey,request)", coordinator);
    const reclaim = lifecycle.indexOf("await reclaimTanstackPreviewCapacity(ownerKey,request.buildProjectId)", authorize);
    const reserve = lifecycle.indexOf("reserveTanstackPreviewCapacity(ownerKey)", reclaim);
    expect(coordinator).toBeGreaterThan(-1);
    expect(authorize).toBeGreaterThan(coordinator);
    expect(reclaim).toBeGreaterThan(authorize);
    expect(reserve).toBeGreaterThan(reclaim);
    expect(lifecycle).toContain("sharedPreviewProjectDrains.beginStart(");
  });
  it("keeps the lease counted until Docker and workspace teardown actually succeed", () => {
    const registry = read("src/services/build/sharedPreviewRegistry.ts");
    expect(registry.indexOf("await lease.close();")).toBeLessThan(registry.indexOf("this.live.delete(id);"));
    expect(registry).toContain("if (pending) { await pending; return true; }");
    expect(registry).toContain("this.closing.set(id, marker)");
    const lifecycle = read("src/services/build/tanstackPreviewSharedLifecycle.ts");
    expect(lifecycle).toContain('basePath: `/quarantined/${id}/`');
    expect(lifecycle).toContain("close: error.recover");
  });
  it("enforces one-preview admission, hard expiry and idle eviction without React/Vite", () => {
    const capacity = read("src/services/build/tanstackPreviewCapacity.ts");
    const lifecycle = read("src/services/build/tanstackPreviewSharedLifecycle.ts");
    expect(capacity).toContain("assertZoeBuildPreviewCapacity(sharedFullStackPreviews.count(), pendingGlobal)");
    expect(capacity).toContain("sharedFullStackPreviews.sweep(now, IDLE_MS, TANSTACK_PREVIEW_HARD_LIFETIME_MS)");
    expect(capacity).toContain("countActiveSessionsForActor(ownerKey)");
    expect(capacity).toContain("countActiveSessionsGlobal()");
    expect(lifecycle).toContain("if (prior.sourceVersion > request.sourceVersion)");
    expect(lifecycle).toContain("await sharedFullStackPreviews.close(prior.id)");
  });
  it("keeps the 429 capacity response behind Runner service authentication", () => {
    const route = read("src/routes/build.previews.operations.ts");
    const app = read("src/app.ts");
    expect(route).toContain("/Runner is busy|Too many active sessions/");
    expect(route).toContain("? 429");
    expect(app.indexOf("app.use(requireServiceAuth)")).toBeLessThan(app.indexOf('app.post("/build/previews/operations/start"'));
  });
});
