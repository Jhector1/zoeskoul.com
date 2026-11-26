import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
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
  vi.unstubAllEnvs();
  await fs.rm(parent,{recursive:true,force:true});
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const update = (options: Partial<Parameters<typeof applySuspendedTanstackDevelopmentSource>[0]> = {}) =>
  applySuspendedTanstackDevelopmentSource({containerId:CID,workspaceRoot:parent,
    workspaceDir,changedPaths:changed,next,...options});

describe("suspended TanStack development workspace writer (not routed)", () => {
  it("replaces an authorized file atomically only while Docker is paused",async()=>{
    let mtimeAtResume:number|null=null;
    const watcher:{current:FSWatcher|null}={current:null};
    let observed!:()=>void;
    const notification=new Promise<void>(resolve=>{observed=resolve;});
    container.unpause.mockImplementationOnce(async()=>{
      mtimeAtResume=(await fs.stat(path.join(workspaceDir,"src/routes/index.tsx"))).mtimeMs;
      paused=false;
      // Begin observing only after the atomic replacement has completed. This
      // proves the explicit post-resume event, not the original rename.
      watcher.current=watch(path.join(workspaceDir,"src/routes/index.tsx"),()=>observed());
    });
    try {
      await update();
      await expect(Promise.race([
        notification,
        new Promise((_,reject)=>setTimeout(()=>reject(new Error("watcher timeout")),1_000)),
      ])).resolves.toBeUndefined();
    } finally { watcher.current?.close(); }
    expect(await fs.readFile(path.join(workspaceDir,"src/routes/index.tsx"),"utf8"))
      .toBe("new content");
    expect(container.pause).toHaveBeenCalledOnce();
    expect(container.unpause).toHaveBeenCalledOnce();
    expect(paused).toBe(false);
    expect((await fs.stat(path.join(workspaceDir,"src/routes/index.tsx"))).mtimeMs)
      .toBeGreaterThan(mtimeAtResume!);
    expect((await fs.readdir(path.join(workspaceDir,"src/routes"))).sort())
      .toEqual(["index.tsx"]);
  });

  it("fails closed if a resumed sandbox swaps the watcher target",async()=>{
    const outside=path.join(parent,"outside.tsx");
    const target=path.join(workspaceDir,"src/routes/index.tsx");
    await fs.writeFile(outside,"unrelated");
    container.unpause.mockImplementationOnce(async()=>{
      paused=false;
      await fs.unlink(target);
      await fs.symlink(outside,target);
    });
    await expect(update()).rejects.toThrow("workspace update failed");
    expect(await fs.readFile(outside,"utf8")).toBe("unrelated");
    expect(paused).toBe(false);
  });

  it.each([false,true])("rejects a resumed parent symlink substitution (deletion=%s)",async(deletion)=>{
    const outside=path.join(parent,"outside");
    const routes=path.join(workspaceDir,"src/routes");
    await fs.mkdir(outside);
    if (!deletion) await fs.writeFile(path.join(outside,"index.tsx"),"unrelated");
    const sentinel=deletion ? outside : path.join(outside,"index.tsx");
    const before=await fs.stat(sentinel);
    container.unpause.mockImplementationOnce(async()=>{
      paused=false;
      await fs.rename(routes,routes+"-original");
      await fs.symlink(outside,routes);
    });
    await expect(update(deletion ? {next:{files:[]}} : {})).rejects.toThrow("workspace update failed");
    const after=await fs.stat(sentinel);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.ctimeMs).toBe(before.ctimeMs);
    if (!deletion) expect(await fs.readFile(sentinel,"utf8")).toBe("unrelated");
  });

  it("rejects a pre-existing hard-linked source before mutation",async()=>{
    const target=path.join(workspaceDir,"src/routes/index.tsx");
    const outside=path.join(parent,"outside.tsx");
    await fs.link(target,outside);
    const before=await fs.stat(outside);
    await expect(update()).rejects.toThrow("workspace update failed");
    expect(await fs.readFile(outside,"utf8")).toBe("old content");
    const after=await fs.stat(outside);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.nlink).toBe(2);
    expect(paused).toBe(false);
  });

  it.each(["replacement","hard-link","alias"] as const)("rejects resumed inode changes: %s",async(mode)=>{
    const target=path.join(workspaceDir,"src/routes/index.tsx");
    const outside=path.join(parent,"outside.tsx");
    await fs.writeFile(outside,"unrelated");
    container.unpause.mockImplementationOnce(async()=>{
      paused=false;
      if (mode==="alias") await fs.link(target,path.join(workspaceDir,"alias.tsx"));
      else {
        await fs.unlink(target);
        if (mode==="hard-link") await fs.link(outside,target);
        else await fs.writeFile(target,"replacement");
      }
    });
    const before=await fs.stat(outside);
    await expect(update()).rejects.toThrow("workspace update failed");
    expect((await fs.stat(outside)).mtimeMs).toBe(before.mtimeMs);
    expect(await fs.readFile(outside,"utf8")).toBe("unrelated");
  });

  it("cannot redirect pinned utimes during the last check-to-use window",async()=>{
    const outside=path.join(parent,"outside");
    const routes=path.join(workspaceDir,"src/routes");
    const sentinel=path.join(outside,"index.tsx");
    await fs.mkdir(outside);
    await fs.writeFile(sentinel,"unrelated");
    const before=await fs.stat(sentinel);
    const originalOpen=fs.open.bind(fs);
    let raced=false;
    const open=vi.spyOn(fs,"open").mockImplementation(async(...args:Parameters<typeof fs.open>)=>{
      const handle=await originalOpen(...args);
      if (args[0]===path.join(routes,"index.tsx")) {
        const originalUtimes=handle.utimes.bind(handle);
        vi.spyOn(handle,"utimes").mockImplementationOnce(async(atime,mtime)=>{
          expect(paused).toBe(false);
          await fs.rename(routes,routes+"-original");
          await fs.symlink(outside,routes);
          raced=true;
          await originalUtimes(atime,mtime);
        });
      }
      return handle;
    });
    try { await expect(update()).rejects.toThrow("workspace update failed"); }
    finally { open.mockRestore(); }
    expect(raced).toBe(true);
    const after=await fs.stat(sentinel);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.ctimeMs).toBe(before.ctimeMs);
    expect(await fs.readFile(sentinel,"utf8")).toBe("unrelated");
  });

  it.each(["success","resume-failure","notify-failure","partial-pin-failure"] as const)(
    "closes all handles without reopening paths after resume: %s",async(mode)=>{
      const originalOpen=fs.open.bind(fs);
      const opened:Awaited<ReturnType<typeof fs.open>>[]=[];
      const open=vi.spyOn(fs,"open").mockImplementation(async(...args:Parameters<typeof fs.open>)=>{
        expect(paused).toBe(true);
        if (mode==="partial-pin-failure" && args[0]===path.join(workspaceDir,"src/routes/second.tsx"))
          throw new Error("injected pin failure");
        const handle=await originalOpen(...args);
        opened.push(handle);
        if (mode==="notify-failure" && args[0]===path.join(workspaceDir,"src/routes/index.tsx"))
          vi.spyOn(handle,"utimes").mockRejectedValueOnce(new Error("injected notification failure"));
        return handle;
      });
      try {
        if (mode==="resume-failure") container.unpause.mockRejectedValueOnce(new Error("resume failed"));
        const result=mode==="partial-pin-failure" ? update({
          changedPaths:[...changed,"src/routes/second.tsx"],
          next:{files:[...next.files,file("src/routes/second.tsx","export const second = 2;")]},
        }) : update();
        if (mode==="success") await result;
        else await expect(result).rejects.toThrow(mode==="resume-failure" ? "sandbox resume failed" : "workspace update failed");
        expect(opened.length).toBeGreaterThan(0);
        expect(opened.every(handle=>handle.fd===-1)).toBe(true);
      } finally {
        open.mockRestore();
        await Promise.allSettled(opened.filter(handle=>handle.fd!==-1).map(handle=>handle.close()));
      }
    });

  it("notifies a new file and a deleted file's pinned parent after resume",async()=>{
    const newFile=path.join(workspaceDir,"src/components/New.tsx");
    const routes=path.join(workspaceDir,"src/routes");
    let atResume:number[]=[];
    container.unpause.mockImplementationOnce(async()=>{
      atResume=await Promise.all([newFile,routes].map(async p=>(await fs.stat(p)).mtimeMs));
      paused=false;
    });
    await update({changedPaths:[...changed,"src/components/New.tsx"],
      next:{files:[file("src/components/New.tsx","export const New = 1;")]}});
    expect((await fs.stat(newFile)).mtimeMs).toBeGreaterThan(atResume[0]);
    expect((await fs.stat(routes)).mtimeMs).toBeGreaterThan(atResume[1]);
    await expect(fs.lstat(path.join(routes,"index.tsx"))).rejects.toMatchObject({code:"ENOENT"});
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

  it("updates the canonical root stylesheet in the same suspended workspace",async()=>{
    const target=path.join(workspaceDir,"src/styles.css");
    await fs.writeFile(target,"body {color:red}");
    await update({changedPaths:["src/styles.css"],next:{files:[file("src/styles.css","body {color:blue}")]}});
    expect(await fs.readFile(target,"utf8")).toBe("body {color:blue}");
    expect(container.pause).toHaveBeenCalledOnce();
    expect(container.unpause).toHaveBeenCalledOnce();
    expect(paused).toBe(false);
  });
  it("rejects a symlink substituted for the canonical root stylesheet",async()=>{
    const outside=path.join(parent,"outside.css");
    await fs.writeFile(outside,"protected");
    await fs.symlink(outside,path.join(workspaceDir,"src/styles.css"));
    await expect(update({changedPaths:["src/styles.css"],next:{files:[file("src/styles.css","changed")]}})).rejects.toThrow("workspace update failed");
    expect(await fs.readFile(outside,"utf8")).toBe("protected");
    expect(paused).toBe(false);
  });
  it("refuses protected, traversal, duplicated and oversized source inputs before Docker",async()=>{
    const attempts = [
      {changedPaths:["package.json"]},
      {changedPaths:["src/other.css"]},
      {changedPaths:["src/router.tsx"]},
      {changedPaths:["src/server/secret.ts"]},
      {changedPaths:["src/styles.css.ts"]},
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
  it("uploads, replaces, renames and deletes a checksum-verified static PNG without restarting Docker",async()=>{
    vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BINARY_HMR_ENABLED", "true");
    const crypto=await import("node:crypto");
    const png=(name:string,data:string)=>{
      const buffer=Buffer.from(data);
      return {path:`public/images/${name}`,encoding:"base64" as const,
        mimeType:"image/png" as const,data:buffer.toString("base64"),sizeBytes:buffer.length,
        checksum:`sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`};
    };
    const red=png("red.png","red test binary");
    const blue=png("red.png","blue replacement");
    const images=path.join(workspaceDir,"public/images");
    await update({changedPaths:[red.path],previous:{files:[],binaryFiles:[]},next:{files:[],binaryFiles:[red]}});
    expect(await fs.readFile(path.join(images,"red.png"),"utf8")).toBe("red test binary");
    await update({changedPaths:[red.path],previous:{files:[],binaryFiles:[red]},next:{files:[],binaryFiles:[blue]}});
    expect(await fs.readFile(path.join(images,"red.png"),"utf8")).toBe("blue replacement");
    const moved={...blue,path:"public/images/hero.png"};
    await update({changedPaths:[red.path,moved.path],previous:{files:[],binaryFiles:[blue]},next:{files:[],binaryFiles:[moved]}});
    await expect(fs.stat(path.join(images,"red.png"))).rejects.toMatchObject({code:"ENOENT"});
    expect(await fs.readFile(path.join(images,"hero.png"),"utf8")).toBe("blue replacement");
    await update({changedPaths:[moved.path],previous:{files:[],binaryFiles:[moved]},next:{files:[],binaryFiles:[]}});
    await expect(fs.stat(path.join(images,"hero.png"))).rejects.toMatchObject({code:"ENOENT"});
    expect(container.pause).toHaveBeenCalledTimes(4);
    expect(container.unpause).toHaveBeenCalledTimes(4);
    expect(paused).toBe(false);
  });

  it("rejects manipulated image bytes, traversal, MIME mismatch and protected paths before Docker pause",async()=>{
    const bytes=Buffer.from("image data");
    const image={path:"public/images/test.png",encoding:"base64" as const,
      mimeType:"image/png" as const,data:bytes.toString("base64"),sizeBytes:bytes.length,
      checksum:`sha256:${"0".repeat(64)}`};
    const invalid=[image,{...image,path:"public/../secret.png"},
      {...image,mimeType:"image/jpeg" as const},
      {...image,path:"src/routes/index.png"}];
    for (const asset of invalid)
      await expect(update({changedPaths:[asset.path],next:{files:[],binaryFiles:[asset]}})).rejects.toThrow();
    expect(container.pause).not.toHaveBeenCalled();
  });
});

// Public image changes are admitted only after the coordinator has verified
// the exact DB-saved revision. The filesystem writer independently checks
// checksums, path confinement and Docker's paused workspace identity.
describe("suspended public image HMR writer",()=>{
  beforeEach(() => vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BINARY_HMR_ENABLED", "true"));
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=","base64");
  const image=(p:string,bytes:Buffer=png)=>({path:p,encoding:"base64" as const,
    data:bytes.toString("base64"),sizeBytes:bytes.byteLength,mimeType:"image/png" as const,
    checksum:`sha256:${createHash("sha256").update(bytes).digest("hex")}`});
  it("fails closed before Docker pause when operator flag is off",async()=>{
    vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BINARY_HMR_ENABLED", "false");
    await expect(update({changedPaths:["public/images/logo.png"],
      next:{files:[],binaryFiles:[image("public/images/logo.png")]}}))
      .rejects.toThrow("Unsafe development preview source path.");
    expect(container.pause).not.toHaveBeenCalled();
  });
  it("does not reject ordinary text updates when binary flag is off",async()=>{
    vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BINARY_HMR_ENABLED", "false");
    await update({next:{files:next.files,binaryFiles:[image("public/images/logo.png")]}});
    expect(container.pause).toHaveBeenCalledOnce();
  });
  it("writes exact image bytes under public/ without restarting Docker",async()=>{
    await update({changedPaths:["public/images/logo.png"],previous:{files:[],binaryFiles:[]},
      next:{files:[],binaryFiles:[image("public/images/logo.png")]}});
    expect(await fs.readFile(path.join(workspaceDir,"public/images/logo.png"))).toEqual(png);
    expect(container.pause).toHaveBeenCalledOnce();
    expect(container.unpause).toHaveBeenCalledOnce();
    expect(paused).toBe(false);
  });
  it("renames and moves an image with removal of the old path",async()=>{
    await fs.mkdir(path.join(workspaceDir,"public/images"),{recursive:true});
    await fs.writeFile(path.join(workspaceDir,"public/images/logo.png"),png);
    await update({changedPaths:["public/assets/logo.png","public/images/logo.png"],
      previous:{files:[],binaryFiles:[image("public/images/logo.png")]},
      next:{files:[],binaryFiles:[image("public/assets/logo.png")]}});
    expect(await fs.readFile(path.join(workspaceDir,"public/assets/logo.png"))).toEqual(png);
    await expect(fs.stat(path.join(workspaceDir,"public/images/logo.png"))).rejects.toMatchObject({code:"ENOENT"});
    expect(paused).toBe(false);
  });
  it("renames a root screenshot in place with identical bytes",async()=>{
    const oldName="Screenshot 2026-11-22 at 1.37.32\u202fAM.png";
    await fs.writeFile(path.join(workspaceDir,oldName),png);
    await update({changedPaths:[oldName,"red2.png"],previous:{files:[],binaryFiles:[image(oldName)]},
      next:{files:[],binaryFiles:[image("red2.png")]}});
    expect(await fs.readFile(path.join(workspaceDir,"red2.png"))).toEqual(png);
    await expect(fs.stat(path.join(workspaceDir,oldName))).rejects.toMatchObject({code:"ENOENT"});
    expect(container.pause).toHaveBeenCalledOnce();
    expect(container.unpause).toHaveBeenCalledOnce();
  });
  it("rejects image writes without a trusted prior snapshot before pausing",async()=>{
    for (const binaryFiles of [[],[image("root.png")]]) {
      await expect(update({changedPaths:["root.png"],next:{files:[],binaryFiles}})).rejects.toThrow();
    }
    expect(container.pause).not.toHaveBeenCalled();
  });
  it.each(["different_bytes","existing_target","missing_source","symlink_source"])(
    "rejects root rename without modifying any files: %s",async(kind)=>{
      const source=path.join(workspaceDir,"old.png");
      const target=path.join(workspaceDir,"new.png");
      const outside=path.join(parent,"outside.png");
      if (kind==="symlink_source") { await fs.writeFile(outside,png); await fs.symlink(outside,source); }
      else if (kind!=="missing_source") await fs.writeFile(source,kind==="different_bytes"?Buffer.alloc(png.length,1):png);
      if (kind==="existing_target") await fs.writeFile(target,"sentinel");
      await expect(update({changedPaths:["old.png","new.png","src/routes/index.tsx"],
        previous:{files:next.files,binaryFiles:[image("old.png")]},
        next:{files:next.files,binaryFiles:[image("new.png")]}})).rejects.toThrow();
      expect(await fs.readFile(path.join(workspaceDir,"src/routes/index.tsx"),"utf8")).toBe("old content");
      if (kind==="existing_target") expect(await fs.readFile(target,"utf8")).toBe("sentinel");
      else await expect(fs.stat(target)).rejects.toMatchObject({code:"ENOENT"});
      if (kind==="symlink_source") expect((await fs.lstat(source)).isSymbolicLink()).toBe(true);
      else if (kind!=="missing_source") expect(await fs.readFile(source)).toEqual(kind==="different_bytes"?Buffer.alloc(png.length,1):png);
      expect(paused).toBe(false);
    });
  it("moves a root screenshot to public, replaces it, and deletes it using the prior snapshot",async()=>{
    const oldName="Screenshot 2026-11-22 at 1.37.32\u202fAM.png";
    const moved="public/images/"+oldName;
    const replacement=Buffer.from(png); replacement[replacement.length-1]^=1;
    await fs.writeFile(path.join(workspaceDir,oldName),png);
    await update({changedPaths:[oldName,moved],previous:{files:[],binaryFiles:[image(oldName)]},
      next:{files:[],binaryFiles:[image(moved)]}});
    expect(await fs.readFile(path.join(workspaceDir,moved))).toEqual(png);
    await expect(fs.stat(path.join(workspaceDir,oldName))).rejects.toMatchObject({code:"ENOENT"});
    await update({changedPaths:[moved],previous:{files:[],binaryFiles:[image(moved)]},
      next:{files:[],binaryFiles:[image(moved,replacement)]}});
    expect(await fs.readFile(path.join(workspaceDir,moved))).toEqual(replacement);
    await update({changedPaths:[moved],previous:{files:[],binaryFiles:[image(moved,replacement)]},
      next:{files:[],binaryFiles:[]}});
    await expect(fs.stat(path.join(workspaceDir,moved))).rejects.toMatchObject({code:"ENOENT"});
    expect(container.pause).toHaveBeenCalledTimes(3);
    expect(container.unpause).toHaveBeenCalledTimes(3);
  });
  it("creates and deletes a root image against the authoritative prior state",async()=>{
    const name="root.png";
    await update({changedPaths:[name],previous:{files:[],binaryFiles:[]},next:{files:[],binaryFiles:[image(name)]}});
    expect(await fs.readFile(path.join(workspaceDir,name))).toEqual(png);
    await update({changedPaths:[name],previous:{files:[],binaryFiles:[image(name)]},next:{files:[],binaryFiles:[]}});
    await expect(fs.stat(path.join(workspaceDir,name))).rejects.toMatchObject({code:"ENOENT"});
  });
  it("moves an image-only public folder as a bounded file batch, then deletes the files",async()=>{
    const oldPaths=["public/images/a.png","public/images/nested/b.png"];
    const newPaths=["public/assets/a.png","public/assets/nested/b.png"];
    for (const p of oldPaths) {
      await fs.mkdir(path.dirname(path.join(workspaceDir,p)),{recursive:true});
      await fs.writeFile(path.join(workspaceDir,p),png);
    }
    await update({changedPaths:[...oldPaths,...newPaths],
      previous:{files:[],binaryFiles:oldPaths.map(p=>image(p))},next:{files:[],binaryFiles:newPaths.map(p=>image(p))}});
    for (const p of oldPaths) await expect(fs.stat(path.join(workspaceDir,p))).rejects.toMatchObject({code:"ENOENT"});
    for (const p of newPaths) expect(await fs.readFile(path.join(workspaceDir,p))).toEqual(png);
    await update({changedPaths:newPaths,previous:{files:[],binaryFiles:newPaths.map(p=>image(p))},next:{files:[],binaryFiles:[]}});
    for (const p of newPaths) await expect(fs.stat(path.join(workspaceDir,p))).rejects.toMatchObject({code:"ENOENT"});
    expect(container.pause).toHaveBeenCalledTimes(2);
  });
  it("moves a public image back to the project root",async()=>{
    const from="public/images/photo.png",to="photo.png";
    await fs.mkdir(path.dirname(path.join(workspaceDir,from)),{recursive:true});
    await fs.writeFile(path.join(workspaceDir,from),png);
    await update({changedPaths:[from,to],previous:{files:[],binaryFiles:[image(from)]},next:{files:[],binaryFiles:[image(to)]}});
    expect(await fs.readFile(path.join(workspaceDir,to))).toEqual(png);
    await expect(fs.stat(path.join(workspaceDir,from))).rejects.toMatchObject({code:"ENOENT"});
  });
  it("does not delete a modified root image or write unrelated text on preflight failure",async()=>{
    const name="root.png";const modified=Buffer.alloc(png.length,1);
    await fs.writeFile(path.join(workspaceDir,name),modified);
    await expect(update({changedPaths:["src/routes/index.tsx",name],
      previous:{files:next.files,binaryFiles:[image(name)]},next:{files:next.files,binaryFiles:[]}})).rejects.toThrow();
    expect(await fs.readFile(path.join(workspaceDir,name))).toEqual(modified);
    expect(await fs.readFile(path.join(workspaceDir,"src/routes/index.tsx"),"utf8")).toBe("old content");
  });
  it("rejects tampering, mismatched MIME and unsafe path before Docker",async()=>{
    const good=image("public/images/logo.png");
    for(const bad of [
      {...good,checksum:`sha256:${"0".repeat(64)}`},
      {...good,mimeType:"image/jpeg" as const},
      {...good,data:good.data.slice(1)},
    ]) await expect(update({changedPaths:[good.path],next:{files:[],binaryFiles:[bad]}})).rejects.toThrow();
    await expect(update({changedPaths:["public/images/.hidden.png"],
      next:{files:[],binaryFiles:[image("public/images/.hidden.png")]}})).rejects.toThrow();
    expect(container.pause).not.toHaveBeenCalled();
  });
  it("rejects a conflicting text+binary manifest path before Docker pause",async()=>{
    const pathName="public/images/logo.png";
    await expect(update({changedPaths:[pathName],next:{files:[file(pathName,"text")],
      binaryFiles:[image(pathName)]}})).rejects.toThrow("Invalid development preview binary manifest.");
    expect(container.pause).not.toHaveBeenCalled();
  });
  it("rejects a symlink at the public image path",async()=>{
    const outside=path.join(parent,"outside.png");
    await fs.writeFile(outside,png);
    await fs.mkdir(path.join(workspaceDir,"public/images"),{recursive:true});
    await fs.symlink(outside,path.join(workspaceDir,"public/images/logo.png"));
    await expect(update({changedPaths:["public/images/logo.png"],previous:{files:[],binaryFiles:[image("public/images/logo.png")]},
      next:{files:[],binaryFiles:[image("public/images/logo.png")]}})).rejects.toThrow("workspace update failed");
    expect(await fs.readFile(outside)).toEqual(png);
    expect(paused).toBe(false);
  });
});
