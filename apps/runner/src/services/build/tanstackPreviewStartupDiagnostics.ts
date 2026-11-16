/**
 * ZoeBuild-only, failure-path diagnostics for the isolated TanStack Start server.
 * Preview files, Vite logs, Docker errors and container command lines are
 * untrusted. Never print, return, or persist any of their raw contents.
 * The inspection is best-effort and cannot influence the preview lifecycle.
 */
import { docker } from "../docker/dockerClient.js";

type PreviewContainer = ReturnType<typeof docker.getContainer>;
type StateCategory = "running" | "exited" | "unknown";
type LogCategory =
  | "filesystem-permission" | "disk-space" | "memory-exhaustion"
  | "module-resolution" | "port-in-use" | "runtime-configuration"
  | "cloudflare-initialization" | "unclassified" | "no-output";

export type TanstackStartupEvidence = Readonly<{
  containerState: StateCategory;
  exitCode: number | null;
  oomKilled: boolean | null;
  memoryLimitMiB: number | null;
  cpuLimitMillicores: number | null;
  nodeProcessCount: number | null;
  logProbe: "available" | "empty" | "unavailable";
  logCategory: LogCategory;
}>;

const MAX_TAIL_LINES = 80;
const MAX_LOG_BYTES = 32 * 1024;
const PROBE_TIMEOUT_MS = 1_500;

/** Fixed categories only. No user-controlled words flow to telemetry. */
export function classifyTanstackStartupLog(output: string): LogCategory {
  if (!output.trim()) return "no-output";
  if (/\b(?:EACCES|EPERM|EROFS)\b|permission denied|read-only file system/i.test(output))
    return "filesystem-permission";
  if (/\b(?:ENOSPC|EDQUOT)\b|no space left on device/i.test(output))
    return "disk-space";
  if (/heap out of memory|allocation failed|out of memory|cannot allocate memory/i.test(output))
    return "memory-exhaustion";
  if (/\b(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND)\b|cannot find (?:module|package)/i.test(output))
    return "module-resolution";
  if (/\bEADDRINUSE\b|address already in use/i.test(output)) return "port-in-use";
  if (/\bERR_(?:INVALID_ARG|INVALID_PACKAGE_CONFIG|UNKNOWN_FILE_EXTENSION)\b|failed to load config/i.test(output))
    return "runtime-configuration";
  if (/\b(?:miniflare|workerd)\b.{0,100}\b(?:error|failed)\b|\b(?:error|failed)\b.{0,100}\b(?:miniflare|workerd)\b/i.test(output))
    return "cloudflare-initialization";
  return "unclassified";
}

/** Bound Docker calls independently; never block mandatory failure cleanup. */
async function bounded<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(work).catch(() => fallback),
      new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), PROBE_TIMEOUT_MS); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function finiteNonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function captureTanstackStartupEvidence(
  container: Pick<PreviewContainer, "inspect" | "logs" | "top">,
): Promise<TanstackStartupEvidence> {
  const [inspected, raw, processes] = await Promise.all([
    bounded(() => container.inspect(), null),
    bounded(() => container.logs({ follow: false, stdout: true, stderr: true, tail: MAX_TAIL_LINES }), null),
    // Only process *names*, never command lines or arguments (which may carry capabilities).
    bounded(() => container.top({ ps_args: "-eo comm" }), null),
  ]);
  const state = inspected?.State;
  const containerState: StateCategory = state?.Running === true ? "running"
    : state?.Running === false ? "exited" : "unknown";
  const observedExitCode = state?.ExitCode;
  const exitCode = containerState === "exited" && typeof observedExitCode === "number"
    && Number.isInteger(observedExitCode) && observedExitCode >= 0 && observedExitCode <= 255
    ? observedExitCode : null;
  const oomKilled = typeof state?.OOMKilled === "boolean" ? state.OOMKilled : null;
  const memoryBytes = finiteNonnegative(inspected?.HostConfig?.Memory);
  const cpuPeriod = finiteNonnegative(inspected?.HostConfig?.CpuPeriod);
  const cpuQuota = finiteNonnegative(inspected?.HostConfig?.CpuQuota);
  const memoryLimitMiB = memoryBytes === null ? null : Math.floor(memoryBytes / 1048576);
  const cpuLimitMillicores = cpuQuota !== null && cpuPeriod !== null && cpuPeriod > 0
    ? Math.floor(cpuQuota / cpuPeriod * 1000) : null;
  const bytes = Buffer.isBuffer(raw) ? raw.subarray(-MAX_LOG_BYTES) : null;
  const logProbe = raw === null ? "unavailable" : bytes?.length ? "available" : "empty";
  const logCategory = bytes === null ? "no-output" : classifyTanstackStartupLog(bytes.toString("utf8"));
  // Support only exact `comm` responses. A failure is *unavailable*, not zero.
  const names = processes?.Titles?.length === 1 && processes.Titles[0].toLowerCase() === "comm"
    && Array.isArray(processes.Processes) ? processes.Processes : null;
  const nodeProcessCount = names === null ? null : Math.min(256, names.filter((row: unknown) =>
    Array.isArray(row) && row.length === 1 && typeof row[0] === "string" &&
    /^(?:node|pnpm|vite|esbuild)$/.test(row[0])).length);
  return {
    containerState, exitCode, oomKilled, memoryLimitMiB,
    cpuLimitMillicores, nodeProcessCount, logProbe, logCategory,
  };
}
