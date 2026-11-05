import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

describe("ZoeBuild canonical full-stack preview ownership", () => {
  const hook = read("src/components/builder/useReactVitePreview.ts");
  const client = read("src/app/[locale]/projects/[buildProjectId]/BuildWorkspaceClient.tsx");
  const host = read("src/components/builder/PersistentReactPreviewHost.tsx");
  const runner = read("../runner/src/services/build/tanstackPreviewSharedLifecycle.ts");

  it("uses one browser owner across Preview and Code", () => {
    expect(host.match(/<RemoteWebPreview/g)?.length ?? 0).toBe(1);
    expect(client).toContain('slotId="code-preview"');
    expect(client).toContain("remoteWebPreviewSurface={");
  });
  it("invalidates preview leases when the exact saved source version changes", () => {
    const mismatch = hook.indexOf("decideTanstackPreviewSync({");
    expect(mismatch).toBeGreaterThan(-1);
    expect(hook.indexOf('throw new Error("PREVIEW_RESTART_REQUIRED")', mismatch)).toBeGreaterThan(mismatch);
    expect(hook).toContain('decideTanstackPreviewSync');
    expect(hook).toContain("workspaceSyncEntriesEqual");
  });
  it("uses authenticated cancel/start rather than pretending TanStack has Vite HMR", () => {
    expect(hook).toContain('/cancel`');
    expect(hook).not.toContain('/sync`');
    expect(hook).toContain('"PREVIEW_RESTART_REQUIRED"');
    expect(runner).toContain("startAdmittedTanstackPreview");
    expect(runner).toContain("sharedPreviewStartCoordinator.run(");
    expect(runner).toContain("await input.authorize(ownerKey,request)");
  });
  it("does not start an older saved source or reuse a different full-stack revision", () => {
    expect(runner).toContain('request.stackId !== "tanstack-start-v1"');
    expect(runner).toContain('request.templateId !== "tanstack-start-v1"');
    expect(runner).toContain("if (prior.sourceVersion > request.sourceVersion)");
    expect(runner).toContain("await sharedFullStackPreviews.close(prior.id)");
  });
});
