/**
 * Bounded, sanitized diagnosis for trusted one-shot Docker build containers.
 * Logs and Docker error strings are UNTRUSTED. Inspect only fixed tokens;
 * NEVER emit log content, package names, registry URLs, or user source.
 * Classification is diagnostic only; it never changes authorization.
 */
import { docker } from "../docker/dockerClient.js";

type BuildContainer = Awaited<ReturnType<typeof docker.createContainer>>;
export type TrustedBuildFailureCategory =
  | "timeout" | "out-of-memory" | "container-terminated"
  | "filesystem-permission" | "disk-space"
  | "registry-network" | "package-resolution"
  | "nonzero-exit" | "container-error";

type FailureInput = Readonly<{
  timedOut: boolean;
  oomKilled: boolean;
  exitCode: number | null;
  output: string;
}>;

/** Only exact error markers are consulted, not arbitrary package-manager prose. */
export function classifyTrustedBuildFailure(input: FailureInput): TrustedBuildFailureCategory {
  if (input.oomKilled) return "out-of-memory";
  if (input.timedOut) return "timeout";
  if (input.exitCode === 137 || input.exitCode === 143) return "container-terminated";
  if (/\b(?:ENOSPC|EDQUOT|ERR_PNPM_ENOSPC)\b|no space left on device/i.test(input.output))
    return "disk-space";
  if (/\b(?:EACCES|EPERM|EROFS)\b|permission denied|read-only file system/i.test(input.output))
    return "filesystem-permission";
  if (/\b(?:EAI_AGAIN|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ERR_PNPM_FETCH|ERR_PNPM_META_FETCH_FAIL)\b/i.test(input.output))
    return "registry-network";
  if (/\b(?:ERR_PNPM_NO_MATCHING_VERSION|ERR_PNPM_UNSUPPORTED_ENGINE|ERR_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE|ERR_PNPM_PEER_DEP_ISSUES)\b/i.test(input.output))
    return "package-resolution";
  return input.exitCode !== null ? "nonzero-exit" : "container-error";
}

const MAX_LOG_INSPECT_BYTES = 16 * 1024;
const PROBE_TIMEOUT_MS = 1_500;

async function boundedProbe<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.catch(() => fallback),
      new Promise<T>(resolve => {
        timer = setTimeout(() => resolve(fallback), PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type TrustedBuildFailureTelemetry = Readonly<{
  stage: "install" | "build" | "bootstrap";
  category: TrustedBuildFailureCategory;
  elapsedMs: number;
  exitCode: number | null;
  oomKilled: boolean;
  timedOut: boolean;
}>;

/**
 * Read Docker state before the container is removed. On a failed probe,
 * report unavailable status instead of inventing an exit code or OOM.
 * No raw logs or thrown error strings escape into telemetry.
 */
export async function reportTrustedBuildFailure(args: Readonly<{
  container: BuildContainer | null;
  stage: TrustedBuildFailureTelemetry["stage"];
  elapsedMs: number;
  timedOut: boolean;
}>): Promise<TrustedBuildFailureTelemetry> {
  const state = args.container
    ? await boundedProbe(args.container.inspect(), null)
    : null;
  const raw = args.container
    ? await boundedProbe(args.container.logs({follow:false,stdout:true,stderr:true,tail:32}), null)
    : null;
  const output = Buffer.isBuffer(raw)
    ? raw.subarray(Math.max(0, raw.length - MAX_LOG_INSPECT_BYTES)).toString("utf8")
    : "";
  const exitCode = state?.State?.Running === false &&
    typeof state?.State?.ExitCode === "number" && Number.isInteger(state.State.ExitCode)
    ? state.State.ExitCode : null;
  const oomKilled = state?.State?.OOMKilled === true;
  const report: TrustedBuildFailureTelemetry = {
    stage: args.stage,
    category: classifyTrustedBuildFailure({timedOut:args.timedOut,oomKilled,exitCode,output}),
    elapsedMs: Number.isFinite(args.elapsedMs) ? Math.max(0, Math.round(args.elapsedMs)) : 0,
    exitCode,
    oomKilled,
    timedOut: args.timedOut,
  };
  console.error("RUNNER isolated trusted build failed", report);
  return report;
}
