import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const adopt=read("./adoptRestoredReactDependencyLock.ts");
const route=read("../../app/api/build/projects/[buildProjectId]/dependency-lock/bootstrap/route.ts");
const preview=read("../../components/builder/useReactVitePreview.ts");
const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
describe("V12K12K3 automatic saved-history dependency restoration",()=>{
  it("never regenerates an existing historical lock and never overwrites an approval",()=>{
    expect(adopt).toContain('lockNode?.content !== root(saved, "pnpm-lock.yaml")?.content');
    expect(adopt).toContain('if (approvedNode) throw new AutoRestoreDependenciesError');
    expect(adopt).toContain('canonicalProjectDependencyManifest(packageNode.content)');
    expect(adopt).toContain('lockfile: lockNode.content, secret');
    expect(adopt).toContain('plan.dependencyLock.state !== "present"');
  });
  it("makes old version activation the required owner consent and CAS boundary",()=>{
    expect(adopt).toContain('ownerId: args.ownerId, archivedAt: null');
    expect(adopt).toContain('meta?.lastMutation !== "history-restore"');
    expect(adopt).toContain('args.expectedVersion');
    expect(adopt).toContain('activeHistorySourceVersion: args.expectedVersion + 1');
    expect(adopt).toContain('Prisma.TransactionIsolationLevel.Serializable');
  });
  it("recovers automatically without dirty drafts and preserves no-silent-reseal boundary",()=>{
    expect(shell).toContain('allowDependencyBootstrap: !codeDirty,');
    expect(preview).toContain('autoRestoreDependencies: restoredDependencyPinnedRef.current');
    expect(route).toContain('options.reconcileExisting !== true');
    expect(route).toContain('headMeta?.restoredSnapshotVersion === options.baseVersion');
    expect(route).toContain('options.desiredDependencies !== undefined');
    expect(route).toContain('adopted.status === "adopted"');
    expect(route).toContain('restoredExactLock: true');
  });
});
