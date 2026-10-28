import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { claimSavedDependencyFollowUp, clearSavedDependencyRecoveryGuards } from "./savedDependencyRecoveryContinuation";

function storage() {
  const entries = new Map<string,string>();
  return {
    getItem: (key:string) => entries.get(key) ?? null,
    setItem: (key:string,value:string) => { entries.set(key,value); },
    removeItem: (key:string) => { entries.delete(key); },
  };
}

const hook = readFileSync(new URL("../../components/builder/useReactVitePreview.ts", import.meta.url),"utf8");

describe("V12K12K13 dependency recovery continuation", () => {
  it("allows two bounded follow-ups after completed bootstrap before refusing more", () => {
    const store = storage();
    const key = "zoebuild:dependency-recovery:project-1:34";
    expect(claimSavedDependencyFollowUp(store,key)).toBe("initial");
    store.setItem(key,"completed");
    expect(claimSavedDependencyFollowUp(store,key)).toBe("followup");
    expect(claimSavedDependencyFollowUp(store,key)).toBe("final");
    expect(claimSavedDependencyFollowUp(store,key)).toBe("exhausted");
    clearSavedDependencyRecoveryGuards(store,key);
    expect(claimSavedDependencyFollowUp(store,key)).toBe("initial");
  });
  it("fails closed if a completion marker cannot be read or bound", () => {
    const failed = {getItem:():string|null=>{throw Error("blocked");},
      setItem:()=>{throw Error("blocked");},removeItem:()=>{throw Error("blocked");}};
    expect(claimSavedDependencyFollowUp(failed,"key")).toBe("exhausted");
    clearSavedDependencyRecoveryGuards(failed,"key");
  });
  it("synchronizes a successful new source and preserves existing hard safety gates", () => {
    expect(hook).toContain("claimSavedDependencyFollowUp(window.sessionStorage, recoveryKey)");
    expect(hook).toContain('bootstrapData?.code === "BUILD_SOURCE_CONFLICT"');
    expect(hook).toContain("preparedVersion > startingVersion");
    expect(hook).toContain("if (await reconcileConflict(startingVersion)) return;");
    expect(hook).toContain("window.location.reload()");
    expect(hook).toContain("if (!bootstrapAllowedRef.current)");
    expect(hook).toContain("BUILD_DEPENDENCY_LOCK_INVALID");
    expect(hook).toContain("baseVersion: startingVersion");
    expect(hook).toContain("workspaceRevisionRef.current !== startingWorkspaceRevision");
    const shell = readFileSync(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx", import.meta.url),"utf8");
    expect(shell).toContain("current?.sourceVersion === attemptedSourceVersion");
    expect(shell).toContain("sourceVersion: latest.sourceVersion, failed: false");
    expect(shell).toContain("current === attemptedSourceVersion");
  });
  it("keeps history, capacity, and manual editing boundaries unchanged", () => {
    expect(hook).toContain("previewCapacityRetryDelayMs");
    expect(hook).toContain("capacityRetries < 4");
    expect(hook).not.toContain("window.sessionStorage.removeItem(capacityKey)");
    expect(hook).toContain("onSourceConflict?: (attemptedSourceVersion: number) => Promise<boolean>");
    expect(hook).not.toContain("/source-history");
    expect(hook).not.toContain('approveRestoredDependencyRepair: true');
  });
});
