import { describe, expect, it, vi } from "vitest";
import { classifyTrustedBuildFailure, reportTrustedBuildFailure } from "./trustedBuildFailureDiagnostics.js";

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
      expect(visible).not.toContain("ERR_PNPM_META_FETCH_FAIL");
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
