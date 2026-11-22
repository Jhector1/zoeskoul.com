import { describe, expect, it } from "vitest";
import {
  shouldActivateTanstackPreviewHmr,
  assertTanstackPreviewHmrSourceCompatible,
  TanstackPreviewHmrSourceCompatibilityError,
  TANSTACK_PREVIEW_HMR_SANDBOX_ENV,
  assertTanstackSandboxOptions, tanstackPreviewDevCommand, TANSTACK_PREVIEW_OFFLINE_ENV,
} from "./tanstackPreviewRuntimePolicy.js";

describe("Phase 4E3C1 HMR activation is gated by lease mode and transport readiness", () => {
  it("rejects every immutable lease even with both flags", () => {
    expect(shouldActivateTanstackPreviewHmr({
      mode:"immutable",featureEnabled:true,websocketGatewayReady:true,
    })).toBe(false);
  });
  it("fails closed when either transport or feature gate is missing", () => {
    for (const featureEnabled of [false,true]) {
      for (const websocketGatewayReady of [false,true]) {
        expect(shouldActivateTanstackPreviewHmr({
          mode:"development",featureEnabled,websocketGatewayReady,
        })).toBe(featureEnabled && websocketGatewayReady);
      }
    }
  });
  it("exposes only the trusted sandbox env constant", () => {
    expect(TANSTACK_PREVIEW_HMR_SANDBOX_ENV).toBe("ZOEBUILD_PREVIEW_HMR_ENABLED=true");
  });
  it("requires the exact saved-source HMR contract when native HMR is active", () => {
    const compatible = {files:[{path:"vite.config.ts",
      content:'server: { hmr: process.env.ZOEBUILD_PREVIEW_HMR_ENABLED === "true" }'}]};
    const legacy = {files:[{path:"vite.config.ts",content:"server: { hmr: false }"}]};
    expect(() => assertTanstackPreviewHmrSourceCompatible(compatible,true)).not.toThrow();
    expect(() => assertTanstackPreviewHmrSourceCompatible(legacy,false)).not.toThrow();
    expect(() => assertTanstackPreviewHmrSourceCompatible(legacy,true))
      .toThrow(TanstackPreviewHmrSourceCompatibilityError);
    expect(() => assertTanstackPreviewHmrSourceCompatible({files:[]},true))
      .toThrow(TanstackPreviewHmrSourceCompatibilityError);
  });
  it("rejects unexpected HMR env injection in an otherwise valid sandbox", () => {
    const basePath = `/api/build/projects/project_a/preview/preview_12345678-1234-4234-8234-123456789abc/content/${"a".repeat(32)}/`;
    const ordinary = {
      Cmd: tanstackPreviewDevCommand(basePath),
      Env: [`ZOEBUILD_PREVIEW_BASE_PATH=${basePath}`, TANSTACK_PREVIEW_OFFLINE_ENV],
      User: "1000:1000",
      HostConfig: {
        NetworkMode: "none", Privileged: false, ReadonlyRootfs: true,
        CpuQuota: 100000, CpuPeriod: 100000, CapDrop: ["ALL"],
        Memory: 256 * 1024 * 1024, MemorySwap: 256 * 1024 * 1024,
        PidsLimit: 64, Binds: ["/tmp/preview:/workspace:rw"],
        Tmpfs: {}, SecurityOpt: ["no-new-privileges"],
      },
    };
    expect(() => assertTanstackSandboxOptions(ordinary)).not.toThrow();
    const withHmr = {...ordinary, Env:[...ordinary.Env, TANSTACK_PREVIEW_HMR_SANDBOX_ENV]};
    expect(() => assertTanstackSandboxOptions(withHmr)).toThrow(
      "Unsafe full-stack preview sandbox configuration.",
    );
    expect(() => assertTanstackSandboxOptions(withHmr,true)).not.toThrow();
    expect(() => assertTanstackSandboxOptions({...ordinary,Env:[...ordinary.Env,
      "ZOEBUILD_PREVIEW_HMR_ENABLED=false"]},true)).toThrow();
  });
});
