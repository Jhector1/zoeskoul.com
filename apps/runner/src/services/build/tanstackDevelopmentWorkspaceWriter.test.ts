import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { docker } from "../docker/dockerClient.js";
import {
  applySuspendedTanstackDevelopmentSource,
  validateDevelopmentSourceChanges,
} from "./tanstackDevelopmentWorkspaceWriter.js";

vi.mock("../docker/dockerClient.js", () => ({ docker: { getContainer: vi.fn() } }));
const CID = "a".repeat(64);
let parent: string;
let workspaceDir: string;
let paused = false;
let container: {pause: ReturnType<typeof vi.fn>;unpause:ReturnType<typeof vi.fn>;inspect:ReturnType<typeof vi.fn>};
const file = (path: string, content: string) => ({path,content});
const changed = ["src/routes/index.tsx"];
const next = {files:[file("src/routes/index.tsx","new content") ]};

beforeEach(async () => {
  parent = await fs.mkdtemp(path.join(os.tmpdir(),"zoe-preview-writer-"));
  workspaceDir = path.join(parent,`zoeskoul-run-${randomUUID()}`);
  await fs.mkdir(path.join(workspaceDir,"src/routes"),{recursive:true});
  await fs.writeFile(path.join(workspaceDir,"src/routes/index.tsx"),"old content");
  paused = false;
  container = {
    pause:vi.fn(async()=>{paused=true;}),
    unpause:vi.fn(async()=>{paused=false;}),
    inspect:vi.fn(async()=>({
      Id:CID,State:{Running:true,Paused:paused},
      Config:{Labels:{"com.zoeskoul.runner.purpose":"tanstack-start-preview"}},
      HostConfig:{NetworkMode:"none"},
      Mounts:[{Type:"bind",RW:true,Source:workspaceDir,Destination:"/workspace"}],
    })),
  };
  vi.mocked(docker.getContainer).mockReturnValue(container as never);
});
afterEach(async () => {
  await fs.rm(parent,{recursive:true,force:true});
  vi.clearAllMocks();
});

const update = (options: Partial<Parameters<typeof applySuspendedTanstackDevelopmentSource>[0]> = {}) =>
  applySuspendedTanstackDevelopmentSource({containerId:CID,workspaceRoot:parent,
    workspaceDir,changedPaths:changed,next,...options});

describe("suspended TanStack development workspace writer (not routed)", () => {
  it("replaces an authorized file atomically only while Docker is paused",async()=>{
    await update();
    expect(await fs.readFile(path.join(workspaceDir,"src/routes/index.tsx"),"utf8"))
      .toBe("new content");
    expect(container.pause).toHaveBeenCalledOnce();
    expect(container.unpause).toHaveBeenCalledOnce();
    expect(paused).toBe(false);
    expect((await fs.readdir(path.join(workspaceDir,"src/routes"))).sort())
      .toEqual(["index.tsx"]);
  });

  it("supports newly added source directories and source removal",async()=>{
    await update({changedPaths:["src/components/cards/New.tsx"],
      next:{files:[file("src/components/cards/New.tsx","export const New = 1;")]}});
    expect(await fs.readFile(path.join(workspaceDir,"src/components/cards/New.tsx"),"utf8"))
      .toContain("New = 1");
    await update({next:{files:[]}});
    await expect(fs.readFile(path.join(workspaceDir,"src/routes/index.tsx"),"utf8"))
      .rejects.toMatchObject({code:"ENOENT"});
  });

  it("refuses protected, traversal, duplicated and oversized source inputs before Docker",async()=>{
    const attempts = [
      {changedPaths:["package.json"]},
      {changedPaths:["src/routes/../config.ts"]},
      {changedPaths:["src/routes/index.tsx","src/routes/INDEX.TSX"]},
      {changedPaths:["src/routes/index.tsx"],next:{files:[file("src/routes/index.tsx","x".repeat(512*1024+1))]}},
      {changedPaths:[]},
    ];
    for (const options of attempts) await expect(update(options)).rejects.toThrow();
    expect(docker.getContainer).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(workspaceDir,"src/routes/index.tsx"),"utf8"))
      .toBe("old content");
  });

  it("rejects symlink source targets without touching the linked file",async()=>{
    const outside = path.join(parent,"outside.tsx");
    await fs.writeFile(outside,"unrelated");
    await fs.unlink(path.join(workspaceDir,"src/routes/index.tsx"));
    await fs.symlink(outside,path.join(workspaceDir,"src/routes/index.tsx"));
    await expect(update()).rejects.toThrow("Development preview workspace update failed.");
    expect(await fs.readFile(outside,"utf8")).toBe("unrelated");
    expect(container.unpause).toHaveBeenCalledOnce();
    expect(paused).toBe(false);
  });

  it("rejects symlink parents and symlink workspace roots",async()=>{
    const outside = path.join(parent,"outside");
    await fs.mkdir(outside);
    await fs.rename(path.join(workspaceDir,"src/routes"),path.join(workspaceDir,"src/routes-real"));
    await fs.symlink(outside,path.join(workspaceDir,"src/routes"));
    await expect(update()).rejects.toThrow("Development preview workspace update failed.");
    expect(await fs.readdir(outside)).toEqual([]);
    expect(container.unpause).toHaveBeenCalledOnce();
    expect(paused).toBe(false);
    const linkedRoot=path.join(parent,`zoeskoul-run-${randomUUID()}`);
    await fs.symlink(workspaceDir,linkedRoot);
    await expect(update({workspaceDir:linkedRoot})).rejects.toThrow("Unsafe development preview workspace root");
  });

  it("refuses wrong container label, mount and stopped state before pausing",async()=>{
    container.inspect.mockImplementationOnce(async()=>({
      Id:CID,State:{Running:true,Paused:false},
      Config:{Labels:{"com.zoeskoul.runner.purpose":"other"}},
      HostConfig:{NetworkMode:"none"},Mounts:[],
    }));
    await expect(update()).rejects.toThrow("sandbox identity mismatch");
    expect(container.pause).not.toHaveBeenCalled();
  });

  it("refuses Docker pause failures and does not attempt a host write",async()=>{
    container.pause.mockRejectedValueOnce(new Error("Docker down"));
    await expect(update()).rejects.toThrow("Docker down");
    expect(await fs.readFile(path.join(workspaceDir,"src/routes/index.tsx"),"utf8"))
      .toBe("old content");
  });

  it("rejects a sandbox that cannot confirm paused state",async()=>{
    container.pause.mockResolvedValueOnce(undefined);
    await expect(update()).rejects.toThrow("workspace update failed");
    expect(container.unpause).toHaveBeenCalledOnce();
    expect(await fs.readFile(path.join(workspaceDir,"src/routes/index.tsx"),"utf8"))
      .toBe("old content");
  });

  it("fails closed if Docker resume fails",async()=>{
    container.unpause.mockRejectedValueOnce(new Error("resume failed"));
    await expect(update()).rejects.toThrow("sandbox resume failed");
  });

  it("requires a direct, UUID-named private workspace",async()=>{
    await expect(update({workspaceDir:parent})).rejects.toThrow("Invalid development preview workspace identity");
    await expect(update({workspaceDir:path.join(workspaceDir,"nested")}))
      .rejects.toThrow("Invalid development preview workspace identity");
    expect(container.pause).not.toHaveBeenCalled();
  });

  it("validates changed path selections without granting write authority",()=>{
    expect(validateDevelopmentSourceChanges(changed,next.files))
      .toEqual([{path:"src/routes/index.tsx",content:"new content"}]);
    expect(validateDevelopmentSourceChanges(changed,[]))
      .toEqual([{path:"src/routes/index.tsx",content:null}]);
  });
});
