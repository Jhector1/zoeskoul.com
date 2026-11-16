import { describe, expect, it } from "vitest";
import { captureTanstackStartupEvidence, classifyTanstackStartupLog } from "./tanstackPreviewStartupDiagnostics.js";

const sensitive = "PRIVATE_SOURCE SECRET_PREVIEW_CAPABILITY https://token@example.invalid";

describe("ZoeBuild-only TanStack startup evidence", () => {
  it("recognizes fixed failure categories without reflecting any log content", () => {
    for (const [sample, category] of [
      ["Error [ERR_MODULE_NOT_FOUND]: Cannot find package", "module-resolution"],
      ["EACCES: permission denied", "filesystem-permission"],
      ["EROFS: read-only file system", "filesystem-permission"],
      ["ENOSPC: no space left on device", "disk-space"],
      ["FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory", "memory-exhaustion"],
      ["EADDRINUSE: address already in use", "port-in-use"],
      ["failed to load config", "runtime-configuration"],
      ["Miniflare startup error", "cloudflare-initialization"],
      [sensitive, "unclassified"],
      ["", "no-output"],
    ] as const) {
      expect(classifyTanstackStartupLog(sample)).toBe(category);
      expect(classifyTanstackStartupLog(sample)).not.toContain("PRIVATE_SOURCE");
    }
  });

  it("captures only bounded state, process counts, memory policy and category", async () => {
    const evidence = await captureTanstackStartupEvidence({
      inspect: async () => ({State:{Running:true,OOMKilled:false,ExitCode:0},
        HostConfig:{Memory:384*1048576,CpuQuota:80000,CpuPeriod:100000}}),
      logs: async (options: {tail:number}) => {
        expect(options.tail).toBe(80);
        return Buffer.from(`${sensitive} ERR_MODULE_NOT_FOUND: cannot find module /workspace/secret`);
      },
      top: async (options: {ps_args:string}) => {
        expect(options.ps_args).toBe("-eo comm");
        return {Titles:["comm"], Processes:[["python3"],["node"],["esbuild"],[sensitive]]};
      },
    } as never);
    expect(evidence).toEqual({
      containerState:"running",exitCode:null,oomKilled:false,
      memoryLimitMiB:384,cpuLimitMillicores:800,nodeProcessCount:2,
      logProbe:"available",logCategory:"module-resolution",
    });
    expect(JSON.stringify(evidence)).not.toContain("PRIVATE_SOURCE");
    expect(JSON.stringify(evidence)).not.toContain("token@example.invalid");
  });

  it("distinguishes an exited process and OOM flag from a manual SIGKILL", async () => {
    const evidence = await captureTanstackStartupEvidence({
      inspect:async()=>({State:{Running:false,OOMKilled:true,ExitCode:137},HostConfig:{}}),
      logs:async()=>Buffer.alloc(0),top:async()=>({Titles:["comm"],Processes:[]}),
    } as never);
    expect(evidence).toMatchObject({containerState:"exited",exitCode:137,oomKilled:true,
      nodeProcessCount:0,logProbe:"empty",logCategory:"no-output"});
  });

  it("fails diagnostically closed if Docker is unavailable; no raw errors escape", async () => {
    const evidence = await captureTanstackStartupEvidence({
      inspect:async()=>{throw Error(sensitive);},
      logs:async()=>{throw Error(sensitive);},
      top:async()=>{throw Error(sensitive);},
    } as never);
    expect(evidence).toEqual({
      containerState:"unknown",exitCode:null,oomKilled:null,
      memoryLimitMiB:null,cpuLimitMillicores:null,nodeProcessCount:null,
      logProbe:"unavailable",logCategory:"no-output",
    });
    expect(JSON.stringify(evidence)).not.toContain(sensitive);
  });
});
