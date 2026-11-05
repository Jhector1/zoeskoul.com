import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../../components/builder/useReactVitePreview.ts", import.meta.url), "utf8");

describe("K20D2A in-page restored preview handoff wiring", () => {
  it("retains strict ordinary conflict fencing and gates equal CAS on successful bootstrap", () => {
    expect(shell).toContain("mayHydratePreparedDependencySource(");
    expect(shell).toContain("onSourceConflict: reconcileStalePreview");
    expect(shell).toContain("onDependencyPrepared: (version) => reconcileStalePreview(version, true)");
  });
  it("refreshes exact-lock snapshots without browser reload or a new save", () => {
    expect(hook).toContain("if (await reconcilePreparedDependencies(startingVersion)) return;");
    expect(hook).toContain("setPreparedReplaySerial(serial => serial + 1)");
    expect(hook).toContain("await startPromiseRef.current?.catch(() => undefined)");
    expect(hook).not.toContain("window.location.reload()");
    expect(hook).toContain("claimSavedDependencyFollowUp(window.sessionStorage, recoveryKey)");
  });
});
