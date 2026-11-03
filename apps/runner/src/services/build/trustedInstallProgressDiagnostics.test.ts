import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractTrustedPnpmCounters,
  startTrustedInstallProgressDiagnostics,
} from "./trustedInstallProgressDiagnostics.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, {recursive: true, force: true})));
});

describe("P3B3 trusted-install progress diagnostics", () => {
  it("extracts only fixed pnpm numeric counters from untrusted text", () => {
    expect(extractTrustedPnpmCounters(
      "Progress: resolved 2, reused 0, downloaded 1, added 0\n" +
      "PRIVATE_TOKEN https://registry.example.invalid/secret\n" +
      "Progress: resolved 149, reused 23, downloaded 98, added 87",
    )).toEqual({resolved:149,reused:23,downloaded:98,added:87});
    expect(extractTrustedPnpmCounters("Progress: resolved 1234567890123, reused 0, downloaded 0, added 0"))
      .toBeNull();
    expect(extractTrustedPnpmCounters("Authorization: Bearer secret"))
      .toBeNull();
  });

  it("emits bounded, fixed telemetry from a real disposable workspace and no raw logs", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "trusted-progress-"));
    directories.push(workspaceDir);
    const storeDir = path.join(workspaceDir, ".zoebuild-runtime", "pnpm-store");
    await fs.mkdir(storeDir, {recursive:true});
    await fs.writeFile(path.join(storeDir, "dummy.bin"), Buffer.alloc(1024));
    await fs.mkdir(path.join(workspaceDir, "node_modules"));
    const secret = "https://registry.example.invalid/token-PRIVATE_SECRET";
    let log = Buffer.from(`Progress: resolved 11, reused 3, downloaded 7, added 5\n${secret}`);
    const container = { logs: vi.fn(async () => log) };
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const monitor = startTrustedInstallProgressDiagnostics({
        container, workspaceDir, stage: "install",
      });
      await monitor.captureFailure();
      log = Buffer.from(`Progress: resolved 14, reused 3, downloaded 10, added 8\n${secret}`);
      await monitor.captureFailure();
      await monitor.stop();
      expect(spy).toHaveBeenCalledTimes(2);
      const report = spy.mock.calls[1]?.[1] as Record<string, unknown>;
      expect(report).toMatchObject({
        stage: "install", reason: "failure", logProbe: "available", logChanged:true,
        pnpm: {resolved:14,reused:3,downloaded:10,added:8},
      });
      expect(typeof report.storeKiB).toBe("number");
      expect(typeof report.workspaceFilesystemFreeBytes).toBe("number");
      const visible = JSON.stringify(spy.mock.calls);
      expect(visible).not.toContain(secret);
      expect(visible).not.toContain(workspaceDir);
      expect(visible).not.toContain("dummy.bin");
    } finally {
      spy.mockRestore();
    }
  });

  it("reports unavailable Docker logs without leaking probe errors", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "trusted-progress-"));
    directories.push(workspaceDir);
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const monitor = startTrustedInstallProgressDiagnostics({
        container:{logs: async () => {throw new Error("DO_NOT_LOG_SECRET");}},
        workspaceDir, stage: "bootstrap",
      });
      await monitor.captureFailure();
      await monitor.stop();
      expect(spy.mock.calls[0]?.[1]).toMatchObject({
        stage:"bootstrap",logProbe:"unavailable",pnpm:null,
      });
      expect(JSON.stringify(spy.mock.calls)).not.toContain("DO_NOT_LOG_SECRET");
    } finally {
      spy.mockRestore();
    }
  });
});
