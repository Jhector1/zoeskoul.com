import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const adoption = read("./adoptRestoredReactDependencyLock.ts");
const route = read("../../app/api/build/projects/[buildProjectId]/dependency-lock/bootstrap/route.ts");

describe("K20D3E historical dependency adoption transaction lifecycle", () => {
  it("does history parsing and trusted artifact sealing before acquiring a transaction", () => {
    const txn = adoption.indexOf("return client.$transaction(async tx =>");
    expect(adoption.indexOf("await client.buildProject.findFirst(")).toBeLessThan(txn);
    expect(adoption.indexOf("await client.codeProjectRevision.findUnique(")).toBeLessThan(txn);
    expect(adoption.indexOf("parseBuildWorkspaceMutation(previous.snapshot)")).toBeLessThan(txn);
    expect(adoption.indexOf("sealProjectDependencies({")).toBeLessThan(txn);
    expect(adoption.indexOf("prepareRegisteredBuildArtifactPlan({")).toBeLessThan(txn);
    expect(adoption.indexOf("const sourceToCommit = {")).toBeLessThan(txn);
  });

  it("revalidates authorization and exact restored head before the canonical CAS writer", () => {
    const txn = adoption.indexOf("return client.$transaction(async tx =>");
    const writer = adoption.indexOf("saveCodeProjectInTransaction(tx, sourceToCommit)");
    expect(txn).toBeGreaterThan(0);
    expect(adoption.indexOf("await tx.buildProject.findFirst(", txn)).toBeGreaterThan(txn);
    expect(adoption.indexOf("ownerId: args.ownerId, archivedAt: null", txn)).toBeLessThan(writer);
    expect(adoption.indexOf("head.currentVersion !== args.expectedVersion", txn)).toBeLessThan(writer);
    expect(adoption.indexOf('headMeta?.lastMutation !== "history-restore"', txn)).toBeLessThan(writer);
    expect(adoption.indexOf("activeSavedHistoryVersion(head.currentVersion, head.meta) !== historyVersion", txn)).toBeLessThan(writer);
    expect(adoption.indexOf("head.workspaceHash !== cp.workspaceHash", txn)).toBeLessThan(writer);
    expect(adoption.indexOf("JSON.stringify(currentWorkspace.workspace) !== JSON.stringify(cp.workspace)", txn)).toBeLessThan(writer);
    expect(adoption).toContain("Prisma.TransactionIsolationLevel.Serializable");
    expect(adoption).toContain("createRevision: false");
    expect(adoption).toContain("baseVersion: args.expectedVersion");
    expect(adoption).toContain("args.expectedVersion + 1");
  });

  it("never overwrites a historical lock, an approval, or a different selected revision", () => {
    expect(adoption).toContain('lockNode?.content !== root(saved, "pnpm-lock.yaml")?.content');
    expect(adoption).toContain('if (approvedNode) throw new AutoRestoreDependenciesError');
    expect(adoption).toContain('canonicalProjectDependencyManifest(packageNode.content)');
    expect(adoption).toContain('lockfile: lockNode.content, secret');
    expect(adoption).toContain('plan.dependencyLock.state !== "present"');
    expect(adoption).toContain("restoredFromVersion: historyVersion");
  });

  it("returns transaction connection saturation as 503, without replaying mutations", () => {
    expect(route).toContain('error.code === "P2028"');
    expect(route).toContain('error.message.includes("Unable to start a transaction in the given time")');
    expect(route).toContain('code: "BUILD_DATABASE_BUSY"');
    expect(route).toContain('response.headers.set("Retry-After", "10")');
    expect(route).toContain('message: "Project storage is busy. Your saved version is unchanged; retry the preview."');
    expect(adoption).toContain("maxWait: 15_000");
    expect(adoption).toContain("timeout: 30_000");
    expect(route).not.toContain("retryMutatingBootstrap");
  });
});
