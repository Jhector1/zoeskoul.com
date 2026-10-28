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
}>;

export type ReactPreviewCapabilityContext = Readonly<{
  previewId: string;
  buildProjectId: string;
  sourceVersion: number;
}>;

export async function startTrustedReactPreviewAtRunner(args: Readonly<{
  actorKey: string;
  request: ProductionBuildJobRequestV1;
}>) {
  const result = await runnerPost<{ ok: true; preview: ReactPreviewStartResult }>(
    "/build/previews/start",
    args.actorKey,
    args.request,
  );
  return result.preview;
}

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
}>) {
  const result = await runnerPost<{
    ok: true;
    response: ReactPreviewFetchResult;
  }>(
    `/build/previews/${encodeURIComponent(args.previewId)}/proxy-fetch`,
    "zoebuild-preview-proxy",
    { path: args.path, method: args.method },
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
  code?: "PREVIEW_CAPACITY" | "PREVIEW_SOURCE_CONFLICT" | "PREVIEW_START_FAILED" | "PREVIEW_CANCELLED" | "PREVIEW_RUNNER_RESTARTED";
  preview?: ReactPreviewStartResult;
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
