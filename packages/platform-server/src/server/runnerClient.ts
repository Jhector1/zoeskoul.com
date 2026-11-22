import { buildRunnerHeaders } from "@zoeskoul/curriculum-runtime";

function getRunnerBaseUrl() {
  const base =
    process.env.RUNNER_BASE_URL?.trim();
  if (!base) {
    throw new Error("Missing RUNNER_BASE_URL");
  }

  const normalized = base.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error(
      "RUNNER_BASE_URL must start with http:// or https://",
    );
  }

  return normalized;
}

const BUILD_FAILURE_CATEGORIES = ["timeout", "out-of-memory", "container-terminated", "filesystem-permission", "disk-space", "registry-network", "package-resolution", "dependency-state", "package-integrity", "nonzero-exit", "container-error"] as const;
const LOG_PROBES = ["available", "empty", "unavailable"] as const;
export type RunnerBuildDiagnostic = Readonly<{
  stage: "install" | "build";
  category: typeof BUILD_FAILURE_CATEGORIES[number];
  exitCode: number | null;
  oomKilled: boolean;
  timedOut: boolean;
  logProbe: typeof LOG_PROBES[number];
  compilerDiagnostics: readonly Readonly<{code:string;path:string|null;line:number|null;column:number|null}>[];
}>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function positiveLocation(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 1_000_000;
}
/** Decode only the authenticated production-build failure envelope. Never retain
 * raw stderr, error prose, unknown fields or a path outside the candidate. */
export function parseRunnerBuildDiagnostic(value: unknown, body: unknown): RunnerBuildDiagnostic | undefined {
  const d = record(value); const request = record(body);
  if (!d || request?.operation !== "production-build" || !Array.isArray(request.files) || request.files.length > 300 ||
      (d.stage !== "install" && d.stage !== "build") ||
      !(BUILD_FAILURE_CATEGORIES as readonly unknown[]).includes(d.category) ||
      !(LOG_PROBES as readonly unknown[]).includes(d.logProbe) ||
      typeof d.oomKilled !== "boolean" || typeof d.timedOut !== "boolean" ||
      !(d.exitCode === null || (typeof d.exitCode === "number" && Number.isSafeInteger(d.exitCode) && d.exitCode >= -1 && d.exitCode <= 255)) ||
      !Array.isArray(d.compilerDiagnostics) || d.compilerDiagnostics.length > 16) return undefined;
  const paths = new Set(request.files.map(file => record(file)?.path));
  const compilerDiagnostics: RunnerBuildDiagnostic["compilerDiagnostics"][number][] = [];
  for (const value of d.compilerDiagnostics) {
    const item = record(value);
    if (!item || typeof item.code !== "string" || !/^TS\d{4,5}$/.test(item.code)) continue;
    if (item.path === null && item.line === null && item.column === null) {
      compilerDiagnostics.push({code:item.code,path:null,line:null,column:null});
    } else if (typeof item.path === "string" && item.path.length <= 240 && paths.has(item.path) &&
        positiveLocation(item.line) && positiveLocation(item.column)) {
      compilerDiagnostics.push({code:item.code,path:item.path,line:item.line,column:item.column});
    }
  }
  return {stage:d.stage,category:d.category as RunnerBuildDiagnostic["category"],exitCode:d.exitCode as number|null,
    oomKilled:d.oomKilled,timedOut:d.timedOut,logProbe:d.logProbe as RunnerBuildDiagnostic["logProbe"],
    compilerDiagnostics:d.stage === "build" ? compilerDiagnostics : []};
}

export class RunnerHttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string, readonly buildDiagnostic?: RunnerBuildDiagnostic) {
    super(message);
    this.status = status;
    if (code && /^[A-Z][A-Z0-9_]{2,96}$/.test(code)) this.code = code;
  }
}

export async function runnerPost<T>(
  path: string,
  actorKey: string,
  body?: unknown,
  options: Readonly<{ requestId?: string }> = {},
): Promise<T> {
  const url = `${getRunnerBaseUrl()}${path}`;
  const requestId = options.requestId?.trim();
  if (requestId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new Error("Invalid Runner request correlation.");
  }

  let res: Response;

  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        ...buildRunnerHeaders({ actorKey }),
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error: any) {
    const cause = error?.cause?.message ? `: ${error.cause.message}` : "";
    throw new Error(`Runner fetch failed for ${path}${cause}`);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new RunnerHttpError(
      res.status,
      (data as any)?.error ?? `Runner error: ${res.status}`,
      typeof (data as any)?.code === "string" ? (data as any).code : undefined,
      path === "/build/jobs/production-build" &&
        ((res.status === 422 && data?.code === "BUILD_COMPILATION_REJECTED") ||
         (res.status === 502 && data?.code === "BUILD_DEPENDENCY_INSTALL_FAILED") ||
         (res.status === 504 && data?.code === "BUILD_RUNNER_STEP_TIMEOUT"))
        ? parseRunnerBuildDiagnostic(data?.buildDiagnostic, body) : undefined,
    );
  }

  return data as T;
}
