import { randomBytes, randomUUID } from "node:crypto";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { makeTanstackPreviewDockerDriver } from "./tanstackPreviewDockerDriver.js";
import { startIsolatedTanstackPreview, stopIsolatedTanstackPreview, type TanstackPreviewDriver } from "./tanstackPreviewLifecycle.js";
import { normalizeTanstackPreviewHttpRequest } from "./tanstackPreviewHttpBoundary.js";
import { tanstackInternalPreviewPath } from "./tanstackPreviewRuntimePolicy.js";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { sharedPreviewStartCoordinator, sharedPreviewProjectDrains } from "./sharedPreviewRuntimeState.js";
import { reserveReactPreviewCapacityForSharedRuntime, reclaimReactPreviewCapacityForSharedRuntime } from "./reactPreviewRuntime.js";
import { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";

/** Internal integration point. No route calls this yet. The caller MUST verify
 * owner + source version + canonical registered manifest and signed dependency
 * approval BEFORE the driver is allowed to execute customer-controlled code.
 * Authority is mandatory and may not be replaced with prompt/model claims. */
export async function startAdmittedTanstackPreview(input: Readonly<{
  ownerKey: string;
  request: ProductionBuildJobRequestV1;
  authorize: (ownerKey: string, request: ProductionBuildJobRequestV1) => Promise<void>;
  signal?: AbortSignal;
  driverFactory?: (request: ProductionBuildJobRequestV1) => TanstackPreviewDriver;
}>) {
  if (!input.ownerKey || input.request.stackId !== "tanstack-start-v1" ||
      input.request.templateId !== "tanstack-start-v1" || input.request.operation !== "production-build")
    throw new Error("Invalid TanStack preview identity.");
  if (typeof input.authorize !== "function") throw new Error("Preview authorization required.");
  const {request,ownerKey} = input;
  return sharedPreviewStartCoordinator.run(async () => {
    const endStart = sharedPreviewProjectDrains.beginStart(ownerKey,request.buildProjectId);
    try {
      if (input.signal?.aborted) throw new Error("Preview cancelled.");
      await input.authorize(ownerKey,request);
      if (input.signal?.aborted) throw new Error("Preview cancelled.");
      // Do not silently switch back to an older saved source or run two live
      // revisions of the same project. Reuse is a later explicit, verified sync.
      for (const prior of sharedFullStackPreviews.list()) {
        if (prior.ownerKey !== ownerKey || prior.buildProjectId !== request.buildProjectId) continue;
        if (prior.sourceVersion > request.sourceVersion) throw new Error("Preview source is stale.");
        await sharedFullStackPreviews.close(prior.id);
      }
      await reclaimReactPreviewCapacityForSharedRuntime(ownerKey,request.buildProjectId);
      const releasePending = reserveReactPreviewCapacityForSharedRuntime(ownerKey);
      let handle: Awaited<ReturnType<typeof startIsolatedTanstackPreview>> | null = null;
      let driver: TanstackPreviewDriver | null = null;
      try {
        const createdDriver = (input.driverFactory ?? makeTanstackPreviewDockerDriver)(request);
        driver = createdDriver;
        handle = await startIsolatedTanstackPreview(createdDriver,{signal:input.signal});
        if (input.signal?.aborted) throw new Error("Preview cancelled.");
        const previewId = `preview_${randomUUID()}`;
        const publicAccessKey = randomBytes(24).toString("base64url");
        const basePath = `/api/build/projects/${encodeURIComponent(request.buildProjectId)}/preview/${previewId}/content/${publicAccessKey}/`;
        const createdAt = Date.now();
        const owned = handle;
        sharedFullStackPreviews.register({
          id:previewId, ownerKey, buildProjectId:request.buildProjectId,
          sourceVersion:request.sourceVersion, containerId:owned.containerId, basePath, createdAt, lastActivityAt:createdAt,
          close: () => stopIsolatedTanstackPreview(createdDriver,owned),
        });
        return {previewId,buildProjectId:request.buildProjectId,sourceVersion:request.sourceVersion,
          port:5173 as const,basePath};
      } catch (error) {
        if (handle && driver) {
          try { await stopIsolatedTanstackPreview(driver,handle); }
          catch {
            // A cleanup failure is NOT a free slot: retain it for the shared
            // sweeper to retry, without exposing a successful preview URL.
            const held = handle;
            const controller = driver;
            const id = `preview_${randomUUID()}`;
            const now = Date.now();
            sharedFullStackPreviews.register({
              id, ownerKey, buildProjectId:request.buildProjectId,sourceVersion:request.sourceVersion,
              containerId:held.containerId,basePath:`/quarantined/${id}/`,
              createdAt:now-60*60_000,lastActivityAt:now-10*60_000,
              close:()=>stopIsolatedTanstackPreview(controller,held),
            });
            throw new Error("Preview failed; sandbox cleanup requires reconciliation.",{cause:error});
          }
        }
        throw error;
      } finally { releasePending(); }
    } finally { endStart(); }
  });
}

/** Capability-only fetch, with no platform credentials forwarded to generated
 * code. Source version is tied to the live lease, never browser-provided. */
export async function fetchAdmittedTanstackPreview(input: Readonly<{
  previewId:string; path:string; method:"GET"|"HEAD"|"POST";
  headers?: unknown; bodyBase64?:unknown;
}>) {
  const lease=sharedFullStackPreviews.get(input.previewId);
  if (!lease) throw new Error("Preview not found.");
  if (input.method === "POST") throw new Error("Mutation preview requests require owner-bound authentication, not a bearer preview URL.");
  const safe = normalizeTanstackPreviewHttpRequest({basePath:lease.basePath,
    path:input.path,method:input.method,headers:input.headers,bodyBase64:input.bodyBase64});
  const internalPath=tanstackInternalPreviewPath(lease.basePath,safe);
  const response = await fetchTanstackHttpInsideSandbox(lease.containerId,{...safe,path:internalPath});
  sharedFullStackPreviews.touch(input.previewId,Date.now());
  return {sourceVersion:lease.sourceVersion,response};
}

export async function stopAdmittedTanstackPreview(ownerKey:string,previewId:string) {
  const lease=sharedFullStackPreviews.get(previewId);
  if (!lease) throw new Error("Preview not found.");
  if (lease.ownerKey !== ownerKey) throw new Error("Forbidden.");
  await sharedFullStackPreviews.close(previewId);
}

/** Owner-bound mutation transport. POST is never granted by a readable preview
 * capability alone; platform service authentication must precede this call. */
export async function postOwnedTanstackPreview(input: Readonly<{
  ownerKey:string;previewId:string;path:string;headers?:unknown;bodyBase64?:unknown;
}>) {
  const lease=sharedFullStackPreviews.get(input.previewId);
  if (!lease) throw new Error("Preview not found.");
  if (!input.ownerKey || lease.ownerKey !== input.ownerKey) throw new Error("Forbidden.");
  const safe=normalizeTanstackPreviewHttpRequest({basePath:lease.basePath,path:input.path,
    method:"POST",headers:input.headers,bodyBase64:input.bodyBase64});
  const internalPath=tanstackInternalPreviewPath(lease.basePath,safe);
  const response=await fetchTanstackHttpInsideSandbox(lease.containerId,{...safe,path:internalPath});
  sharedFullStackPreviews.touch(input.previewId,Date.now());
  return {sourceVersion:lease.sourceVersion,response};
}
