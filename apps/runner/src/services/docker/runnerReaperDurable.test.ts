import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";

const fixture = vi.hoisted(() => ({
  root: "/tmp/zoeskoul-reaper-durable-fixture",
  containers: [] as string[],
  failDelete: false,
  failList: false,
  noEffect: false,
}));
vi.mock("../../lib/env.js", () => ({ env: { get workspaceRoot() { return fixture.root; } } }));
vi.mock("./dockerClient.js", () => ({ docker: {
  listContainers: (_opts:unknown, cb:(error:Error|null,list?:unknown[])=>void) => {
    if (fixture.failList) cb(new Error("daemon unavailable"));
    else cb(null,fixture.containers.map(Id=>({Id,State:"running"})));
  },
  getContainer: (id:string) => ({remove: async () => {
    if (fixture.failDelete) throw new Error("daemon unavailable");
    if (!fixture.noEffect) fixture.containers = fixture.containers.filter(item=>item!==id);
  }}),
}}));
import { cleanupRunnerOrphansOnStartup } from "./runnerReaper.js";
import { createTanstackRecoveryJournal } from "../build/tanstackPreviewDurableRecovery.js";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(),"runner-reaper-gate-"));
  fixture.root = root;
  fixture.containers = [];
  fixture.failDelete = false;
  fixture.failList = false;
  fixture.noEffect = false;
});
afterEach(async()=>{await fs.rm(root,{recursive:true,force:true});});

describe("Runner startup cleanup admission gate",()=>{
  it("keeps journal and workspace if Docker cleanup is unverified", async()=>{
    const workspace = path.join(root,"zoeskoul-run-11111111-1111-4111-8111-111111111111");
    await fs.mkdir(workspace);
    const journal = createTanstackRecoveryJournal(root);
    await journal.write({workspaceDir:workspace,containerId:"b".repeat(64)});
    fixture.containers = ["b".repeat(64)];
    fixture.failDelete = true;
    await expect(cleanupRunnerOrphansOnStartup()).rejects.toThrow("Docker cleanup incomplete");
    expect((await fs.stat(workspace)).isDirectory()).toBe(true);
    expect((await fs.readdir(path.join(root,".zoebuild-tanstack-recovery-v1"))).length).toBe(1);
    fixture.failDelete = false;
    await cleanupRunnerOrphansOnStartup();
    expect(fixture.containers).toEqual([]);
    await expect(fs.stat(workspace)).rejects.toMatchObject({code:"ENOENT"});
    expect(await fs.readdir(path.join(root,".zoebuild-tanstack-recovery-v1"))).toEqual([]);
  });

  it("refuses admission when the daemon cannot enumerate containers",async()=>{
    fixture.failList = true;
    await expect(cleanupRunnerOrphansOnStartup()).rejects.toThrow("daemon unavailable");
  });

  it("requires independent post-removal enumeration",async()=>{
    fixture.containers = ["d".repeat(64)];
    fixture.noEffect = true;
    await expect(cleanupRunnerOrphansOnStartup()).rejects.toThrow("remaining");
  });

  it("never reaps unrelated workspace directories",async()=>{
    const keep=path.join(root,"unrelated-workspace");
    const remove=path.join(root,"zoeskoul-run-33333333-3333-4333-8333-333333333333");
    await fs.mkdir(keep);await fs.mkdir(remove);
    await cleanupRunnerOrphansOnStartup();
    expect((await fs.stat(keep)).isDirectory()).toBe(true);
    await expect(fs.stat(remove)).rejects.toMatchObject({code:"ENOENT"});
  });
});
