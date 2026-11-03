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
  | "dependency-state" | "package-integrity"
  | "nonzero-exit" | "container-error";

type FailureInput = Readonly<{
  timedOut: boolean;
  oomKilled: boolean;
  exitCode: number | null;
  output: string;
}>;

/** Fixed allowlist: no arbitrary token or log content enters telemetry. */
const KNOWN_INSTALL_ERROR_CODES = [
  "ERR_PNPM_OUTDATED_LOCKFILE",
  "ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY",
  "ERR_PNPM_LOCKFILE_CONFIG_MISMATCH",
  "ERR_PNPM_BROKEN_LOCKFILE",
  "ERR_PNPM_NO_MATCHING_VERSION",
  "ERR_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE",
  "ERR_PNPM_UNSUPPORTED_ENGINE",
  "ERR_PNPM_PEER_DEP_ISSUES",
  "ERR_PNPM_FETCH_404",
  "ERR_PNPM_FETCH_500",
  "ERR_PNPM_FETCH_502",
  "ERR_PNPM_FETCH_503",
  "ERR_PNPM_FETCH_504",
  "ERR_PNPM_META_FETCH_FAIL",
  "ERR_PNPM_FETCH_FAIL",
  "ERR_PNPM_TARBALL_INTEGRITY",
  "ERR_PNPM_UNEXPECTED_STORE",
  "ERR_PNPM_MODIFYING_MODULES_DIR",
  "EACCES", "EPERM", "EROFS", "ENOSPC", "EDQUOT",
  "EAI_AGAIN", "ENOTFOUND", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT",
] as const;

type KnownInstallErrorCode = (typeof KNOWN_INSTALL_ERROR_CODES)[number];
const ALLOWED_ERROR_CODES: ReadonlySet<string> = new Set(KNOWN_INSTALL_ERROR_CODES);

/** Return only recognized errors; prefer the last recognized marker in the bounded tail. */
export function extractTrustedInstallErrorCode(output: string): KnownInstallErrorCode | null {
  const seen = output.match(/\b(?:ERR_PNPM_[A-Z0-9_]+|EACCES|EPERM|EROFS|ENOSPC|EDQUOT|EAI_AGAIN|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT)\b/g);
  if (!seen) return null;
  for (let index = seen.length - 1; index >= 0; index--) {
    const candidate = seen[index];
    if (ALLOWED_ERROR_CODES.has(candidate)) return candidate as KnownInstallErrorCode;
  }
  return null;
}

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
  if (/\b(?:ERR_PNPM_FETCH_404|ERR_PNPM_FETCH_500|ERR_PNPM_FETCH_502|ERR_PNPM_FETCH_503|ERR_PNPM_FETCH_504|ERR_PNPM_FETCH_FAIL)\b/i.test(input.output))
    return "registry-network";
  if (/\b(?:ERR_PNPM_OUTDATED_LOCKFILE|ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY|ERR_PNPM_LOCKFILE_CONFIG_MISMATCH|ERR_PNPM_BROKEN_LOCKFILE)\b/i.test(input.output))
    return "package-resolution";
  if (/\b(?:ERR_PNPM_UNEXPECTED_STORE|ERR_PNPM_MODIFYING_MODULES_DIR)\b/i.test(input.output))
    return "dependency-state";
  if (/\bERR_PNPM_TARBALL_INTEGRITY\b/i.test(input.output))
    return "package-integrity";
  return input.exitCode !== null ? "nonzero-exit" : "container-error";
}

const MAX_LOG_INSPECT_BYTES = 64 * 1024;
const MAX_LOG_LINES = 160;
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
  logProbe: "available" | "empty" | "unavailable";
  errorCode: KnownInstallErrorCode | null;
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
    ? await boundedProbe(args.container.logs({follow:false,stdout:true,stderr:true,tail:MAX_LOG_LINES}), null)
    : null;
  const output = Buffer.isBuffer(raw)
    ? raw.subarray(Math.max(0, raw.length - MAX_LOG_INSPECT_BYTES)).toString("utf8")
    : "";
  const exitCode = state?.State?.Running === false &&
    typeof state?.State?.ExitCode === "number" && Number.isInteger(state.State.ExitCode)
    ? state.State.ExitCode : null;
  const oomKilled = state?.State?.OOMKilled === true;
  const logProbe = raw === null ? "unavailable" : (raw.length === 0 ? "empty" : "available");
  const report: TrustedBuildFailureTelemetry = {
    stage: args.stage,
    category: classifyTrustedBuildFailure({timedOut:args.timedOut,oomKilled,exitCode,output}),
    elapsedMs: Number.isFinite(args.elapsedMs) ? Math.max(0, Math.round(args.elapsedMs)) : 0,
    exitCode,
    oomKilled,
    timedOut: args.timedOut,
    logProbe,
    errorCode: extractTrustedInstallErrorCode(output),
  };
  console.error("RUNNER isolated trusted build failed", report);
  return report;
}
