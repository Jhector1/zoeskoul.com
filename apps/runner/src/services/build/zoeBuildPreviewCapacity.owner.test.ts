import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");

describe("ZoeBuild single-preview admission ownership", () => {
  it("checks capacity before reserving a pending start", () => {
    const source = read("src/services/build/reactPreviewRuntime.ts");
    const check = source.indexOf("assertZoeBuildPreviewCapacity(");
    const pending = source.indexOf("pendingPreviewStartsGlobal +=");
    expect(check).toBeGreaterThan(-1);
    expect(pending).toBeGreaterThan(check);
    expect(source).toContain("previews.size,");
    expect(source).toContain("pendingPreviewStartsGlobal,");
  });
  it("keeps the slot during Docker and workspace cleanup and coalesces cancellation", () => {
    const source = read("src/services/build/reactPreviewRuntime.ts");
    const start = source.indexOf("async function destroyPreview(");
    const end = source.indexOf("async function reuseExistingProjectPreview(");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const destroy = source.slice(start, end);
    expect(destroy).toContain("pendingPreviewDestructions.get(record.id)");
    expect(destroy).toContain("pendingPreviewDestructions.set(record.id, cleanup)");
    expect(destroy).toContain(".remove({");
    expect(destroy).toContain("cleanupWorkspaceNow(");
    expect(destroy.indexOf("previews.delete(record.id)")).toBeGreaterThan(destroy.indexOf("cleanupWorkspaceNow("));
  });
  it("preserves preview reuse and existing idle/hard-lifetime cleanup", () => {
    const source = read("src/services/build/reactPreviewRuntime.ts");
    const startIndex = source.indexOf("async function startReactPreviewInternal(");
    const reuseIndex = source.indexOf("await reuseExistingProjectPreview(", startIndex);
    const reservationIndex = source.indexOf("reservePreviewCapacity(", startIndex);
    const wrapperIndex = source.indexOf("export async function startReactPreview(");
    expect(startIndex).toBeGreaterThan(-1);
    expect(reuseIndex).toBeGreaterThan(startIndex);
    expect(reservationIndex).toBeGreaterThan(reuseIndex);
    expect(wrapperIndex).toBeGreaterThan(reservationIndex);
    expect(source.slice(wrapperIndex)).toContain("projectDrains.beginStart(");
    expect(source).toContain("PREVIEW_IDLE_MS");
    expect(source).toContain("PREVIEW_HARD_LIFETIME_MS");
    expect(source).toContain("runReactPreviewCleanupSweep(");
  });
  it("uses the existing 429 status mapping without adding a public execution endpoint", () => {
    const route = read("src/routes/build.previews.start.ts");
    const app = read("src/app.ts");
    expect(route).toContain('message.includes(');
    expect(route).toContain('"Runner is busy"');
    expect(route).toContain('return 429');
    expect(app.indexOf("app.use(requireServiceAuth)")).toBeLessThan(app.indexOf('app.post("/build/previews/start"'));
  });
});
