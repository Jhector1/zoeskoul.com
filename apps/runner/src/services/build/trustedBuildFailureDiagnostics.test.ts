import { describe, expect, it, vi } from "vitest";
import { classifyTrustedBuildFailure, reportTrustedBuildFailure, extractCompilerLocations } from "./trustedBuildFailureDiagnostics.js";

const input = {timedOut:false,oomKilled:false,exitCode:1,output:""} as const;
describe("P3B3 shared isolated build failure telemetry", () => {
  it("distinguishes OOM from a generic 137 kill and honors explicit timeout", () => {
    expect(classifyTrustedBuildFailure({...input,oomKilled:true,exitCode:137})).toBe("out-of-memory");
    expect(classifyTrustedBuildFailure({...input,exitCode:137})).toBe("container-terminated");
    expect(classifyTrustedBuildFailure({...input,timedOut:true,exitCode:null})).toBe("timeout");
  });
  it("classifies known registry, disk, filesystem and package-resolution tokens", () => {
    for (const [output, category] of [
      ["ERR_PNPM_META_FETCH_FAIL EAI_AGAIN", "registry-network"],
      ["ENOSPC: no space left on device", "disk-space"],
      ["EACCES: permission denied", "filesystem-permission"],
      ["ERR_PNPM_NO_MATCHING_VERSION", "package-resolution"],
    ] as const) expect(classifyTrustedBuildFailure({...input,output})).toBe(category);
    expect(classifyTrustedBuildFailure(input)).toBe("nonzero-exit");
    expect(classifyTrustedBuildFailure({...input,exitCode:null})).toBe("container-error");
  });
  it("never logs or returns arbitrary pnpm output, tokens, or Docker error strings", async () => {
    const spy=vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      const report=await reportTrustedBuildFailure({
        stage:"install",elapsedMs:123.4,timedOut:false,
        container:{
          inspect:async()=>({State:{Running:false,ExitCode:1,OOMKilled:false}}),
          logs:async()=>Buffer.from("ERR_PNPM_META_FETCH_FAIL SECRET_TO_NEVER_LOG https://token@example.com"),
        } as never,
      });
      expect(report).toMatchObject({stage:"install",category:"registry-network",exitCode:1,elapsedMs:123});
      const visible=JSON.stringify([report,spy.mock.calls]);
      expect(visible).not.toContain("SECRET_TO_NEVER_LOG");
      expect(visible).not.toContain("token@example.com");
      expect(report.errorCode).toBe("ERR_PNPM_META_FETCH_FAIL");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); }
  });
  it("fails diagnostically closed when Docker inspect and logs are unavailable", async () => {
    const spy=vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      const report=await reportTrustedBuildFailure({
        stage:"bootstrap",elapsedMs:30,timedOut:false,
        container:{inspect:async()=>{throw new Error("secret inspect error");},
          logs:async()=>{throw new Error("secret logs error");}} as never,
      });
      expect(report).toMatchObject({category:"container-error",exitCode:null,oomKilled:false});
      expect(JSON.stringify(spy.mock.calls)).not.toContain("secret");
    } finally {spy.mockRestore();}
  });
});


describe("bounded install failure signal extraction", () => {
  it("classifies fixed lockfile, registry, and dependency-store markers", () => {
    const base = { timedOut:false, oomKilled:false, exitCode:1 };
    expect(classifyTrustedBuildFailure({...base, output:"ERR_PNPM_OUTDATED_LOCKFILE"})).toBe("package-resolution");
    expect(classifyTrustedBuildFailure({...base, output:"ERR_PNPM_FETCH_404"})).toBe("registry-network");
    expect(classifyTrustedBuildFailure({...base, output:"ERR_PNPM_UNEXPECTED_STORE"})).toBe("dependency-state");
    expect(classifyTrustedBuildFailure({...base, output:"ERR_PNPM_TARBALL_INTEGRITY"})).toBe("package-integrity");
    expect(classifyTrustedBuildFailure({...base, output:"ERR_PNPM_UNKNOWN_CUSTOM_CODE"})).toBe("nonzero-exit");
  });
  it("returns a finite allowlisted code and never an attacker-invented marker", async () => {
    const { extractTrustedInstallErrorCode } = await import("./trustedBuildFailureDiagnostics.js");
    expect(extractTrustedInstallErrorCode("ERR_PNPM_OUTDATED_LOCKFILE")).toBe("ERR_PNPM_OUTDATED_LOCKFILE");
    expect(extractTrustedInstallErrorCode("ERR_PNPM_SECRET_PROJECT_PASSWORD")).toBeNull();
    expect(extractTrustedInstallErrorCode("ERR_PNPM_FETCH_404\nERR_PNPM_OUTDATED_LOCKFILE")).toBe("ERR_PNPM_OUTDATED_LOCKFILE");
  });
  it("reports probe state and recognized code without exposing any raw output", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const logs = Buffer.from("SECRET_USER_PATH https://token@example.invalid\nERR_PNPM_OUTDATED_LOCKFILE");
      const report = await reportTrustedBuildFailure({
        stage:"install",elapsedMs:125.8,timedOut:false,
        container:{
          inspect:async()=>({State:{Running:false,ExitCode:1,OOMKilled:false}}),
          logs:async(options: {tail:number})=>{
            expect(options.tail).toBe(160);
            return logs;
          },
        } as never,
      });
      expect(report).toMatchObject({
        category:"package-resolution", exitCode:1, logProbe:"available",
        errorCode:"ERR_PNPM_OUTDATED_LOCKFILE",
      });
      const visible = JSON.stringify([report, spy.mock.calls]);
      expect(visible).not.toContain("SECRET_USER_PATH");
      expect(visible).not.toContain("token@example.invalid");
    } finally { spy.mockRestore(); }
  });
  it("exposes missing Docker logs as unavailable rather than as an assumed clean log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const report = await reportTrustedBuildFailure({
        stage:"install",elapsedMs:20,timedOut:false,
        container:{
          inspect:async()=>({State:{Running:false,ExitCode:1,OOMKilled:false}}),
          logs:async()=>{throw new Error("PRIVATE_ERROR_DETAILS");},
        } as never,
      });
      expect(report).toMatchObject({logProbe:"unavailable", errorCode:null, category:"nonzero-exit"});
      expect(JSON.stringify([report,spy.mock.calls])).not.toContain("PRIVATE_ERROR_DETAILS");
    } finally { spy.mockRestore(); }
  });
});


describe("bounded compiler locations", () => {
  it("extracts codes and coordinates, not messages, and handles Docker framing", () => {
    const payload = Buffer.from("src/game.tsx(12,7): error TS2322: PRIVATE_SECRET\n/workspace/src/game.tsx(12,7): error TS2322: duplicate\nerror TS6059: PRIVATE_PATH\n../../secret(1,1): error TS1005: ignored\n");
    const header = Buffer.alloc(8); header[0]=2; header.writeUInt32BE(payload.length,4);
    expect(extractCompilerLocations(Buffer.concat([header,payload]))).toEqual([
      {code:"TS2322",path:"src/game.tsx",line:12,column:7},
      {code:"TS6059",path:null,line:null,column:null},
    ]);
    expect(extractCompilerLocations(Buffer.concat([header,payload.subarray(0,10)]))).toEqual([]);
  });
  it("never logs compiler paths or prose", async () => {
    const spy=vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      const result=await reportTrustedBuildFailure({stage:"build",elapsedMs:5,timedOut:false,container:{
        inspect:async()=>({State:{Running:false,ExitCode:2,OOMKilled:false}}),
        logs:async()=>Buffer.from("src/private.ts(1,2): error TS1005: TOP_SECRET"),
      } as never});
      expect(result.compilerDiagnostics).toEqual([{code:"TS1005",path:"src/private.ts",line:1,column:2}]);
      expect(JSON.stringify(spy.mock.calls)).not.toContain("src/private.ts");
      expect(JSON.stringify(result)).not.toContain("TOP_SECRET");
    } finally {spy.mockRestore();}
  });
});
