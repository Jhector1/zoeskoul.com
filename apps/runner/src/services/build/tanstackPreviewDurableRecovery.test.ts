import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearReconciledTanstackJournals, createTanstackRecoveryJournal, removeTanstackWorkspaceStrict,
} from "./tanstackPreviewDurableRecovery.js";

let root: string;
let workspace: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tanstack-recovery-test-"));
  workspace = path.join(root, "zoeskoul-run-11111111-1111-4111-8111-111111111111");
  await fs.mkdir(workspace);
});
afterEach(async () => { await fs.rm(root, {recursive:true,force:true}); });

describe("durable TanStack recovery journal", () => {
  it("persists resources without source secrets, only clears after confirmed removal", async () => {
    const journal = createTanstackRecoveryJournal(root);
    await journal.write();
    await journal.write({ workspaceDir: workspace });
    await journal.write({ containerId: "a".repeat(64) });
    const dir = path.join(root, ".zoebuild-tanstack-recovery-v1");
    const data = JSON.parse(await fs.readFile(path.join(dir, `${journal.runId}.json`), "utf8"));
    expect(data).toMatchObject({version:1, workspaceDir:workspace, containerId:"a".repeat(64)});
    expect(Object.keys(data).sort()).toEqual(["containerId","runId","updatedAt","version","workspaceDir"]);
    await expect(journal.clear()).rejects.toThrow("live");
    await journal.write({ containerId:null });
    await removeTanstackWorkspaceStrict(root, workspace);
    await journal.write({ workspaceDir:null });
    await journal.clear();
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("clears stale journal on simulated restart after separate resource reaping", async () => {
    const journal = createTanstackRecoveryJournal(root);
    await journal.write({workspaceDir:workspace,containerId:"b".repeat(64)});
    // Restart cleanup removes Docker first, then the sandbox directory.
    await removeTanstackWorkspaceStrict(root,workspace);
    expect(await clearReconciledTanstackJournals(root)).toBe(1);
    expect(await fs.readdir(path.join(root,".zoebuild-tanstack-recovery-v1"))).toEqual([]);
  });

  it("rejects corrupt journals without trusting their paths", async () => {
    const journal = createTanstackRecoveryJournal(root);
    await journal.write({workspaceDir:workspace});
    const dir = path.join(root,".zoebuild-tanstack-recovery-v1");
    await fs.writeFile(path.join(dir,`${journal.runId}.json`),JSON.stringify({
      ...journal.current,workspaceDir:"/etc",containerId:"b".repeat(64),
    }));
    await expect(clearReconciledTanstackJournals(root)).rejects.toThrow("workspace identity");
    expect((await fs.readdir(dir)).length).toBe(1);
  });

  it("refuses to remove a non-child or symlink workspace", async () => {
    await expect(removeTanstackWorkspaceStrict(root,"/etc")).rejects.toThrow("identity");
    const link = path.join(root,"zoeskoul-run-22222222-2222-4222-8222-222222222222");
    await fs.symlink(workspace, link);
    await expect(removeTanstackWorkspaceStrict(root,link)).rejects.toThrow("Unsafe");
    expect((await fs.stat(workspace)).isDirectory()).toBe(true);
  });
});
