import "server-only";

import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { runnerPost } from "@zoeskoul/platform-server/server/runnerClient";

export type ReactPreviewStartResult = Readonly<{
  previewId: string;
  buildProjectId: string;
  sourceVersion: number;
  basePath: string;
  port: 5173;
}>;

export type ReactPreviewFetchResult = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  bodyBase64: string;
  timing?: Readonly<{
    dockerExecMs?: number;
    viteUpstreamMs?: number | null;
    runnerProxyMs?: number;
  }>;
}>;

export type ReactPreviewCapabilityContext = Readonly<{
  previewId: string;
  buildProjectId: string;
  sourceVersion: number;
}>;

export async function syncTrustedReactPreviewAtRunner(args: Readonly<{
  actorKey: string;
  previewId: string;
  request: ProductionBuildJobRequestV1;
}>) {
  return runnerPost<{ ok: true; previewId: string }>(
    `/build/previews/${encodeURIComponent(args.previewId)}/sync`,
    args.actorKey,
    args.request,
  );
}

export async function cancelTrustedReactPreviewAtRunner(args: Readonly<{
  actorKey: string;
  previewId: string;
}>) {
  return runnerPost<{ ok: true }>(
    `/build/previews/${encodeURIComponent(args.previewId)}/cancel`,
    args.actorKey,
    {},
  );
}

export async function resolveTrustedReactPreviewCapabilityAtRunner(args: Readonly<{
  previewId: string;
  path: string;
}>) {
  const result = await runnerPost<{
    ok: true;
    context: ReactPreviewCapabilityContext;
  }>(
    `/build/previews/${encodeURIComponent(args.previewId)}/resolve-capability`,
    "zoebuild-preview-proxy",
    { path: args.path },
  );

  return result.context;
}

export async function proxyFetchTrustedReactPreviewAtRunner(args: Readonly<{
  previewId: string;
  path: string;
  method: "GET" | "HEAD";
  accept: "text/css" | "*/*";
}>) {
  const result = await runnerPost<{
    ok: true;
    response: ReactPreviewFetchResult;
  }>(
    `/build/previews/${encodeURIComponent(args.previewId)}/proxy-fetch`,
    "zoebuild-preview-proxy",
    { path: args.path, method: args.method, accept: args.accept },
  );
  return result.response;
}

/** Runner-only two-phase preview quiescence during a verified project deletion. */
export async function drainTrustedReactProjectPreviewsAtRunner(args: Readonly<{
  actorKey: string; buildProjectId: string;
}>) {
  return runnerPost<{ ok: true; drainId: string; stoppedCount: number }>(
    "/build/previews/project/drain", args.actorKey, { buildProjectId: args.buildProjectId },
  );
}

export async function releaseTrustedReactProjectPreviewDrainAtRunner(args: Readonly<{
  actorKey: string; buildProjectId: string; drainId: string;
}>) {
  return runnerPost<{ ok: true }>(
    "/build/previews/project/release", args.actorKey,
    { buildProjectId: args.buildProjectId, drainId: args.drainId },
  );
}


export type ReactPreviewOperationResult = Readonly<{
  operationId: string;
  sourceVersion: number;
  state: "preparing" | "ready" | "failed" | "cancelled";
  stage: "queued" | "workspace" | "dependencies" | "container" | "readiness";
  code?: "PREVIEW_CAPACITY" | "PREVIEW_SOURCE_CONFLICT" | "PREVIEW_START_FAILED" | "PREVIEW_CANCELLED" | "PREVIEW_RUNNER_RESTARTED" | "PREVIEW_LEASE_UNAVAILABLE";
  preview?: ReactPreviewStartResult;
  timing: Readonly<{
    startKind: "cold" | "restart" | "reuse";
    reuseCandidate: boolean;
    stages: Readonly<Record<string, Readonly<{
      outcome: "ok" | "error" | "cancelled" | "pending" | "unavailable";
      durationMs?: number;
      reason?: "not_started" | "in_progress" | "prior_stage_failed";
    }>>>;
  }>;
}>;
export async function submitTrustedReactPreviewOperationAtRunner(args: Readonly<{
  actorKey: string; request: ProductionBuildJobRequestV1;
}>): Promise<ReactPreviewOperationResult> {
  const result = await runnerPost<{ ok:true; operation:ReactPreviewOperationResult }>(
    "/build/previews/operations/start", args.actorKey, args.request);
  return result.operation;
}
export async function getTrustedReactPreviewOperationAtRunner(args: Readonly<{
  actorKey: string; operationId: string; buildProjectId: string;
}>): Promise<ReactPreviewOperationResult> {
  const result = await runnerPost<{ ok:true; operation:ReactPreviewOperationResult }>(
    `/build/previews/operations/${encodeURIComponent(args.operationId)}/status`, args.actorKey, {buildProjectId:args.buildProjectId});
  return result.operation;
}
export async function cancelTrustedReactPreviewOperationAtRunner(args: Readonly<{
  actorKey: string; operationId: string; buildProjectId: string;
}>) {
  return runnerPost<{ ok:true }>(
    `/build/previews/operations/${encodeURIComponent(args.operationId)}/cancel`, args.actorKey, {buildProjectId:args.buildProjectId});
}

/** Phase 4D: private service-only creation of an isolated development lease.
 * This method does not expose its capability to a browser. The caller MUST
 * have derived the request from the currently saved, owned DB workspace. */
export async function startTrustedReactDevelopmentPreviewAtRunner(args: Readonly<{
  actorKey: string;
  request: ProductionBuildJobRequestV1;
  requestId?: string;
}>): Promise<ReactPreviewStartResult> {
  const result = await runnerPost<{ ok: true; preview: ReactPreviewStartResult }>(
    "/build/previews/development/start", args.actorKey, args.request,
    { requestId: args.requestId });
  return result.preview;
}

/** Phase 4E1: owner-verified development update, never a browser capability.
 * The caller MUST submit a fresh, DB-derived production-build request. */
export async function updateTrustedReactDevelopmentPreviewAtRunner(args: Readonly<{
  actorKey: string;
  previewId: string;
  request: ProductionBuildJobRequestV1;
}>): Promise<Readonly<{ action: "updated"; sourceVersion: number }>> {
  return runnerPost<{ ok: true; action: "updated"; sourceVersion: number }>(
    `/build/previews/${encodeURIComponent(args.previewId)}/development-update`,
    args.actorKey, args.request,
  );
}

/** Phase 4E2B2: read-only authenticated Runner development fetch.
 * The Runner independently asserts actor/project/lease/revision, and strips
 * its private Vite base from textual responses. */
export async function proxyFetchTrustedReactDevelopmentPreviewAtRunner(args:Readonly<{
  actorKey:string; previewId:string; buildProjectId:string;
  sourceVersion:number;path:string;method:"GET"|"HEAD";accept:"*/*"|"text/css";
}>):Promise<Readonly<{sourceVersion:number;response:ReactPreviewFetchResult}>> {
  return runnerPost<{ok:true;sourceVersion:number;response:ReactPreviewFetchResult}>(
    `/build/previews/${encodeURIComponent(args.previewId)}/development-fetch`,
    args.actorKey,
    {buildProjectId:args.buildProjectId,sourceVersion:args.sourceVersion,
      path:args.path,method:args.method,accept:args.accept},
  );
}

/** Phase 4E3C3B: server-to-server HMR ticket request.
 * Only the dedicated ZoeBuild authorization layer may call this; do not
 * include the Runner service credential in any browser response. */
export async function issueTrustedReactDevelopmentHmrTicketAtRunner(args: Readonly<{
  actorKey: string;
  previewId: string;
  buildProjectId: string;
  sourceVersion: number;
  origin: string;
}>): Promise<Readonly<{
  ok: true;
  ticket: string;
  expiresInMs: number;
  wsPath: string;
}>> {
  return runnerPost<{
    ok: true;
    ticket: string;
    expiresInMs: number;
    wsPath: string;
  }>(
    `/build/previews/${encodeURIComponent(args.previewId)}/development-hmr-ticket`,
    args.actorKey,
    {
      buildProjectId: args.buildProjectId,
      sourceVersion: args.sourceVersion,
      origin: args.origin,
    },
  );
}
