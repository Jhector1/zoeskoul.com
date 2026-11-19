import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../lib/env.js";
import { getDirectoryUsage, getStrictDirectoryUsage, reserveWorkspaceRootCapacity } from "./workspacePolicy.js";

describe("workspace disk usage scanner", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-workspace-usage-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("counts nested bytes and entries", async () => {
    await fs.mkdir(path.join(root, "nested"), { recursive: true });
    await fs.writeFile(path.join(root, "a.txt"), "1234");
    await fs.writeFile(path.join(root, "nested", "b.txt"), "123456");

    await expect(getDirectoryUsage(root)).resolves.toEqual({
      bytes: 10,
      entries: 3,
    });
  });

  it("stops scanning once a byte or entry ceiling is exceeded", async () => {
    await fs.writeFile(path.join(root, "a.txt"), "123456");
    await fs.writeFile(path.join(root, "b.txt"), "abcdef");

    const byBytes = await getDirectoryUsage(root, { maxBytes: 5 });
    expect(byBytes.bytes).toBeGreaterThan(5);

    const byEntries = await getDirectoryUsage(root, { maxEntries: 1 });
    expect(byEntries.entries).toBeGreaterThan(1);
  });

  it("does not follow a final-component symlink while accounting bytes",async()=>{
    const outside=path.join(os.tmpdir(),`zoe-workspace-outside-${process.pid}.txt`);
    await fs.writeFile(outside,"x".repeat(4096));
    try {
      await fs.symlink(outside,path.join(root,"linked.txt"));
      await fs.writeFile(path.join(root,"owned.txt"),"1234");
      await expect(getStrictDirectoryUsage(root)).resolves.toEqual({bytes:4,entries:2});
    } finally {await fs.rm(outside,{force:true});}
  });

  it("accounts a representative wide tree with bounded concurrent metadata I/O",async()=>{
    await Promise.all(Array.from({length:512},async(_,index)=>{
      const dir=path.join(root,`d-${index%16}`);
      await fs.mkdir(dir,{recursive:true});
      await fs.writeFile(path.join(dir,`f-${index}.txt`),"12345678");
    }));
    await expect(getStrictDirectoryUsage(root)).resolves.toEqual({bytes:4096,entries:528});
  });
  it("counts hardlinks per name, and refuses an incomplete strict scan", async()=>{
    await fs.writeFile(path.join(root,"one"),"1234");
    await fs.link(path.join(root,"one"),path.join(root,"two"));
    await expect(getStrictDirectoryUsage(root)).resolves.toEqual({bytes:8,entries:2});
    vi.spyOn(fs,"opendir").mockRejectedValueOnce(Object.assign(Error("private path"),{code:"EACCES"}));
    await expect(getStrictDirectoryUsage(root)).rejects.toThrow("Runner workspace accounting incomplete.");
  });

  it("refuses a symlink root and a directory replaced during enumeration",async()=>{
    const nested=path.join(root,"nested");
    const moved=path.join(root,"moved");
    await fs.mkdir(nested);
    await fs.writeFile(path.join(nested,"file"),"1234");
    const original=fs.opendir.bind(fs);
    const spy=vi.spyOn(fs,"opendir").mockImplementationOnce(async(target,options)=>{
      const opened=await original(target,options);
      await fs.rename(nested,moved);
      await fs.symlink(moved,nested);
      return opened;
    });
    try { await expect(getStrictDirectoryUsage(nested)).rejects.toThrow("accounting incomplete"); }
    finally {spy.mockRestore();}
    await expect(getStrictDirectoryUsage(nested)).rejects.toThrow("accounting incomplete");
    await expect(getStrictDirectoryUsage(root)).resolves.toEqual({bytes:4,entries:3});
  });

  it("keeps a ledger alive across zero-byte and queued reservations",async()=>{
    const defer=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
    const limit=env.maxWorkspaceRootBytes;
    const big=Math.floor(limit*0.7);
    vi.spyOn(fs,"statfs").mockResolvedValue({type:0,bsize:4096,blocks:1e9,bfree:1e9,bavail:1e9,files:1e9,ffree:1e9} as never);
    const first=await reserveWorkspaceRootCapacity(root,1);
    const entered=defer(),resume=defer();
    vi.spyOn(fs,"mkdir").mockImplementationOnce(async()=>{entered.resolve();await resume.promise;return undefined;});
    const zero=reserveWorkspaceRootCapacity(root,0);
    await entered.promise;
    first();
    const a=reserveWorkspaceRootCapacity(root,big);
    resume.resolve();
    const releaseZero=await zero;
    const b=reserveWorkspaceRootCapacity(root,big);
    const rejected=expect(b).rejects.toThrow("cannot reserve additional storage");
    const releaseA=await a;
    try { await rejected; }
    finally { releaseA(); releaseA(); releaseZero(); }
    const again=await reserveWorkspaceRootCapacity(root,big);
    again();
  });

});
