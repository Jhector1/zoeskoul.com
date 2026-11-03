/**
 * Bounded, sanitized progress telemetry for trusted package-install containers.
 *
 * No raw Docker logs, dependency names, paths, registry URLs, or file contents
 * are emitted. Every probe is best-effort; it must not affect installation,
 * wall-time enforcement, resource cleanup, authorization, or the sandbox.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { TRUSTED_PNPM_STORE_DIR } from "./trustedPnpmWorkspaceEnvironment.js";

const execFileAsync = promisify(execFile);
const INTERVAL_MS = 20_000;
const PROBE_TIMEOUT_MS = 1_500;
const MAX_LOG_BYTES = 32 * 1024;
const MAX_LOG_LINES = 100;
const DU_TIMEOUT_MS = 1_500;

export type TrustedInstallStage = "install" | "bootstrap";
type LogContainer = { logs(options: {follow: false; stdout: true; stderr: true; tail: number}): Promise<unknown> };
type ProgressCounts = Readonly<{ resolved: number; reused: number; downloaded: number; added: number }>;

/** Read only numeric counters matching pnpm's fixed, documented progress shape. */
export function extractTrustedPnpmCounters(raw: string): ProgressCounts | null {
  // A hostile project can print arbitrary text. Never log any of it verbatim.
  const pattern = /\bProgress:\s*resolved\s+(\d{1,9}),\s*reused\s+(\d{1,9}),\s*downloaded\s+(\d{1,9}),\s*added\s+(\d{1,9})(?!\d)/g;
  let latest: ProgressCounts | null = null;
  for (const match of raw.matchAll(pattern)) {
    latest = {
      resolved: Number(match[1]),
      reused: Number(match[2]),
      downloaded: Number(match[3]),
      added: Number(match[4]),
    };
  }
  return latest;
}

async function bounded<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      work.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

async function boundedTreeKiB(directory: string): Promise<number | null> {
  try {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
    // GNU du; fixed argv, no shell, filesystem boundary, finite runtime.
    // Path output is discarded and is NEVER logged.
    const result = await execFileAsync("du", ["-skx", directory], {
      timeout: DU_TIMEOUT_MS,
      maxBuffer: 2_048,
    });
    const firstField = result.stdout.match(/^(\d{1,12})\s/);
    if (!firstField) return null;
    const kib = Number(firstField[1]);
    return Number.isSafeInteger(kib) ? kib : null;
  } catch {
    return null;
  }
}

async function workspaceFilesystemFreeBytes(workspaceDir: string): Promise<number | null> {
  try {
    const stat = await fs.statfs(workspaceDir);
    const bytes = stat.bavail * stat.bsize;
    return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
  } catch {
    return null;
  }
}

const storeRelative = path.posix.relative("/workspace", TRUSTED_PNPM_STORE_DIR);
if (!storeRelative || storeRelative.startsWith("..") || path.posix.isAbsolute(storeRelative)) {
  throw new Error("Trusted pnpm store path must remain within /workspace.");
}

export type TrustedInstallProgressTelemetry = Readonly<{
  stage: TrustedInstallStage;
  reason: "periodic" | "failure";
  elapsedMs: number;
  logProbe: "available" | "empty" | "unavailable";
  logChanged: boolean | null;
  lastLogChangeAgoMs: number | null;
  pnpm: ProgressCounts | null;
  storeKiB: number | null;
  nodeModulesKiB: number | null;
  workspaceFilesystemFreeBytes: number | null;
}>;

/** Time-scoped. Each monitor is private to one trusted install or bootstrap. */
export function startTrustedInstallProgressDiagnostics(args: Readonly<{
  container: LogContainer;
  workspaceDir: string;
  stage: TrustedInstallStage;
  intervalMs?: number; // test seam; all production callers use the fixed interval
}>): Readonly<{
  captureFailure(): Promise<void>;
  stop(): Promise<void>;
}> {
  const startedAt = Date.now();
  const intervalMs = args.intervalMs ?? INTERVAL_MS;
  let stopped = false;
  let intervalSuspended = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Promise<void> = Promise.resolve();
  let lastDigest: string | null = null;
  let lastLogChangedAt: number | null = null;

  async function sample(reason: TrustedInstallProgressTelemetry["reason"]): Promise<void> {
    const now = Date.now();
    const storePath = path.join(args.workspaceDir, storeRelative);
    const [raw, storeKiB, nodeModulesKiB, freeBytes] = await Promise.all([
      bounded(args.container.logs({follow:false,stdout:true,stderr:true,tail:MAX_LOG_LINES}), null),
      boundedTreeKiB(storePath),
      boundedTreeKiB(path.join(args.workspaceDir, "node_modules")),
      bounded(workspaceFilesystemFreeBytes(args.workspaceDir), null),
    ]);
    // dockerode can return multiplexed binary stdout/stderr frames.
    // Scan only a small bounded tail; never print any source data.
    const bytes = Buffer.isBuffer(raw) ? raw.subarray(-MAX_LOG_BYTES) : null;
    const logProbe = raw === null ? "unavailable" : bytes?.length ? "available" : "empty";
    const digest = bytes === null ? null : createHash("sha256").update(bytes).digest("hex");
    let logChanged: boolean | null = null;
    if (digest !== null) {
      logChanged = lastDigest !== digest;
      if (logChanged) lastLogChangedAt = now;
      lastDigest = digest;
    }
    const result: TrustedInstallProgressTelemetry = {
      stage: args.stage,
      reason,
      elapsedMs: Math.max(0, now - startedAt),
      logProbe,
      logChanged,
      lastLogChangeAgoMs: lastLogChangedAt === null ? null : Math.max(0, now - lastLogChangedAt),
      pnpm: bytes === null ? null : extractTrustedPnpmCounters(bytes.toString("utf8")),
      storeKiB,
      nodeModulesKiB,
      workspaceFilesystemFreeBytes: freeBytes,
    };
    console.info("RUNNER isolated trusted install progress", result);
  }

  function queue(reason: TrustedInstallProgressTelemetry["reason"]): Promise<void> {
    const next = pending.then(() => sample(reason)).catch(() => undefined);
    pending = next;
    return next;
  }

  function schedule(): void {
    if (stopped || intervalSuspended) return;
    timer = setTimeout(() => {
      void queue("periodic").then(() => schedule());
    }, intervalMs);
    timer.unref?.();
  }

  schedule();
  return {
    async captureFailure(): Promise<void> {
      intervalSuspended = true;
      if (timer) clearTimeout(timer);
      await queue("failure");
    },
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearTimeout(timer);
      await pending;
    },
  };
}
