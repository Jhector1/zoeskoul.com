import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { claimSavedDependencyFollowUp } from "./savedDependencyRecoveryContinuation";
const read = (rel:string) => readFileSync(new URL(rel,import.meta.url),"utf8");

describe("K15 saved preview retry and source conflict", () => {
  it("does not permanently consume a conflict token before authoritative refresh succeeds", () => {
    const hook=read("../../components/builder/useReactVitePreview.ts");
    const check=hook.indexOf('if (!refresh || !(await refresh(attemptedVersion))) return false;');
    const claim=hook.indexOf('triedResyncVersionsRef.current.add(attemptedVersion);');
    expect(check).toBeGreaterThan(0);
    expect(claim).toBeGreaterThan(check);
  });
  it("bounds the manual-retry-equivalent without bypassing server package decisions", () => {
    const map=new Map<string,string>();
    const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);},removeItem:(k:string)=>{map.delete(k);}};
    const key="zoebuild:dependency-recovery:example:42";
    expect(claimSavedDependencyFollowUp(storage,key)).toBe("initial");
    storage.setItem(key,"completed");
    expect(claimSavedDependencyFollowUp(storage,key)).toBe("followup");
    expect(claimSavedDependencyFollowUp(storage,key)).toBe("final");
    expect(claimSavedDependencyFollowUp(storage,key)).toBe("exhausted");
    const hook=read("../../components/builder/useReactVitePreview.ts");
    expect(hook).toContain('baseVersion: startingVersion');
    expect(hook).toContain('BUILD_RESTORE_DEPENDENCIES_UNVERIFIED');
    expect(hook).toContain('!bootstrapAllowedRef.current');
    expect(hook).not.toContain('approveRestoredDependencyRepair: true');
  });
  it("keeps client budget failures separate from actual server dependency denials", () => {
    const hook=read("../../components/builder/useReactVitePreview.ts");
    const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    expect(hook).toContain("Automatic preview preparation did not finish after bounded retries.");
    expect(hook).toContain('console.warn("[ZoeBuild preview] dependency preparation rejected"');
    expect(hook).toContain('Reason: ${reason}');
    expect(shell).toContain("<summary>Technical details</summary>");
  });
});
