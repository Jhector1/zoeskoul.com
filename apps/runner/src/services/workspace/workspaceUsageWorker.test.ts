import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getWorkerDirectoryUsage } from "./workspaceUsageWorker.js";
import { getStrictDirectoryUsage } from "./workspacePolicy.js";

let root: string;
beforeEach(async () => {root=await fs.mkdtemp(path.join(os.tmpdir(),"zoe-u19-scan-"));});
afterEach(async () => {await fs.rm(root,{recursive:true,force:true});});
describe("bounded fresh workspace accounting", () => {
  it("matches original strict accounting for nested dependencies, hardlinks, symlinks and sparse files",async()=>{
    const d=path.join(root,"node_modules",".pnpm");
    await fs.mkdir(d,{recursive:true});
    await fs.writeFile(path.join(d,"one"),"1234");
    await fs.link(path.join(d,"one"),path.join(d,"two"));
    await fs.symlink("/etc/passwd",path.join(d,"outside"));
    await fs.symlink("node_modules",path.join(root,"alias"));
    const file=await fs.open(path.join(root,"sparse"),"w");
    try {await file.truncate(1024*1024);} finally {await file.close();}
    const old=await getStrictDirectoryUsage(root);
    expect(old).toEqual({bytes:1048584,entries:7});
    expect(await getWorkerDirectoryUsage(root)).toEqual(old);
  });
  it("never reuses completed results, including same-name growth",async()=>{
    const f=path.join(root,"file");
    await fs.writeFile(f,"123");
    expect(await getWorkerDirectoryUsage(root)).toEqual({bytes:3,entries:1});
    await fs.appendFile(f,"4567");
    expect(await getWorkerDirectoryUsage(root)).toEqual({bytes:7,entries:1});
  });
  it("exceeds both independent ceilings without reporting a successful undercount",async()=>{
    await fs.writeFile(path.join(root,"one"),"123456");
    await fs.writeFile(path.join(root,"two"),"789012");
    expect((await getWorkerDirectoryUsage(root,{maxBytes:5})).bytes).toBeGreaterThan(5);
    expect((await getWorkerDirectoryUsage(root,{maxEntries:1})).entries).toBeGreaterThan(1);
  });
  it("fails closed for missing roots, symbolic roots and invalid ceilings, then recovers",async()=>{
    const link=path.join(root,"link");await fs.symlink(root,link);
    await expect(getWorkerDirectoryUsage(link)).rejects.toThrow("accounting incomplete");
    await expect(getWorkerDirectoryUsage(path.join(root,"absent"))).rejects.toThrow("accounting incomplete");
    await expect(getWorkerDirectoryUsage(root,{maxBytes:-1})).rejects.toThrow("accounting incomplete");
    expect(await getWorkerDirectoryUsage(root)).toEqual({bytes:0,entries:1});
  });
  it("serializes overlapping scans, preserving each request's independent result",async()=>{
    await fs.writeFile(path.join(root,"a"),"12345");
    const result=await Promise.all([getWorkerDirectoryUsage(root),getWorkerDirectoryUsage(root,{maxBytes:1}),getWorkerDirectoryUsage(root,{maxEntries:0})]);
    expect(result[0]).toEqual({bytes:5,entries:1});
    expect(result[1].bytes).toBeGreaterThan(1);
    expect(result[2].entries).toBeGreaterThan(0);
  });
  it("rejects excessive nesting",async()=>{
    await fs.mkdir(path.join(root,...Array.from({length:128},()=>"d")),{recursive:true});
    await expect(getWorkerDirectoryUsage(root)).rejects.toThrow("accounting incomplete");
  });
});
