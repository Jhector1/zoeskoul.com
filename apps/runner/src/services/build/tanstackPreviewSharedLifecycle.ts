import { createHash, randomBytes, randomUUID } from "node:crypto";
import { env } from "../../lib/env.js";
import { trustedTanstackDevelopmentWorkspaces } from "./tanstackDevelopmentWorkspaceStore.js";
import { trustedTanstackDevelopmentSources } from "./tanstackDevelopmentSourceStore.js";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { makeTanstackPreviewDockerDriver } from "./tanstackPreviewDockerDriver.js";
import { startIsolatedTanstackPreview, stopIsolatedTanstackPreview, TanstackPreviewCleanupError,
  type TanstackPreviewDriver, type TanstackPreviewStartPhase } from "./tanstackPreviewLifecycle.js";
import { normalizeTanstackPreviewHttpRequest } from "./tanstackPreviewHttpBoundary.js";
import { tanstackInternalPreviewPath } from "./tanstackPreviewRuntimePolicy.js";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { sharedPreviewStartCoordinator, sharedPreviewProjectDrains } from "./sharedPreviewRuntimeState.js";
import { reserveTanstackPreviewCapacity, reclaimTanstackPreviewCapacity, TANSTACK_PREVIEW_HARD_LIFETIME_MS } from "./tanstackPreviewCapacity.js";
import { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";
import type { PreviewOperationTelemetry } from "./previewObservability.js";
import type { TanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";

/** Internal authenticated route integration. The caller MUST verify
 * owner + source version + canonical registered manifest and signed dependency
 * approval BEFORE the driver is allowed to execute customer-controlled code.
 * Authority is mandatory and may not be replaced with prompt/model claims. */
type AdmittedPreviewStartInput = Readonly<{
  ownerKey: string;
  request: ProductionBuildJobRequestV1;
  identity: TanstackPreviewIdentity;
  authorize: (ownerKey: string, request: ProductionBuildJobRequestV1) => Promise<void>;
  signal?: AbortSignal;
  onPhase?: (phase: TanstackPreviewStartPhase) => void;
  telemetry?: PreviewOperationTelemetry;
  operationCorrelation?: string;
  driverFactory?: (request: ProductionBuildJobRequestV1, basePath: string) => TanstackPreviewDriver;
}>;

async function startAdmittedPreviewWithMode(
  input: AdmittedPreviewStartInput, mode: "immutable" | "development",
) {
  if (!input.ownerKey || input.request.stackId !== "tanstack-start-v1" ||
      input.request.templateId !== "tanstack-start-v1" || input.request.operation !== "production-build")
    throw new Error("Invalid TanStack preview identity.");
  if (input.operationCorrelation !== undefined && !/^[a-f0-9]{16}$/.test(input.operationCorrelation))
    throw new Error("Invalid preview diagnostic correlation.");
  if (typeof input.authorize !== "function") throw new Error("Preview authorization required.");
  const {request,ownerKey} = input;
  const endQueue = input.telemetry?.begin("queue_wait");
  try { return await sharedPreviewStartCoordinator.run(async () => {
    endQueue?.("ok");
    const endStart = sharedPreviewProjectDrains.beginStart(ownerKey,request.buildProjectId);
    let endLifecycleStart:()=>void=()=>{};
    try {
      endLifecycleStart=sharedFullStackPreviews.beginProjectStart(
        ownerKey,request.buildProjectId);
      if (input.signal?.aborted) throw new Error("Preview cancelled.");
      const endAuthorization = input.telemetry?.begin("runner_authorization");
      try {
        await input.authorize(ownerKey,request);
        endAuthorization?.("ok");
      } catch (error) {
        endAuthorization?.("error");
        throw error;
      }
      if (input.signal?.aborted) throw new Error("Preview cancelled.");
      // Browser refresh and Code/Preview remount attach to an existing healthy
      // lease only for the exact saved source and actor. A non-reusable lease
      // is replaced below under the same serialized, reauthorized transition;
      // single-slot runners never require two concurrent containers.
      if (mode === "development") {
        let prior = sharedFullStackPreviews.list().find(candidate =>
          candidate.mode === "development" && candidate.ownerKey === ownerKey &&
          candidate.buildProjectId === request.buildProjectId);
        if (prior) {
          if(sharedFullStackPreviews.developmentUpdatePending(prior.id)) {
            await sharedFullStackPreviews.waitForDevelopmentSettled(prior.id);
            await input.authorize(ownerKey,request);
            prior=sharedFullStackPreviews.get(prior.id)??undefined;
          }
          if(prior && prior.sourceVersion>request.sourceVersion)
            throw new Error("Preview source is stale.");
          const reusable = await sharedFullStackPreviews.claimDevelopmentReusable({
            ownerKey, buildProjectId:request.buildProjectId,
            sourceVersion:request.sourceVersion, identity:input.identity,
            maxLifetimeMs:TANSTACK_PREVIEW_HARD_LIFETIME_MS,
            healthCheck:checkLeaseHealth,
          });
          if (reusable && trustedTanstackDevelopmentSources.resolve(reusable) &&
              trustedTanstackDevelopmentWorkspaces.resolve(reusable)) {
            // An awaited health check can outlive a DB version/ownership change.
            // Reaffirm authority, then take the registry's close/update fence.
            await input.authorize(ownerKey,request);
            const current = sharedFullStackPreviews.assertDevelopmentReadOpen({
              previewId:reusable.id, ownerKey, buildProjectId:request.buildProjectId,
              sourceVersion:request.sourceVersion,
            });
            if (current.identity.fingerprint !== input.identity.fingerprint ||
                current.identity.sourceFingerprint !== input.identity.sourceFingerprint ||
                current.identity.dependencyFingerprint !== input.identity.dependencyFingerprint ||
                current.identity.runtimeImageId !== input.identity.runtimeImageId ||
                !trustedTanstackDevelopmentSources.resolve(current) ||
                !trustedTanstackDevelopmentWorkspaces.resolve(current))
              throw new Error("Development reattachment identity changed.");
            return {previewId:current.id,buildProjectId:request.buildProjectId,
              sourceVersion:current.sourceVersion,port:5173 as const,basePath:current.basePath};
          }
        }
      }
      input.onPhase?.("lease_admission");
      const projectLeases = sharedFullStackPreviews.list().filter(prior =>
        prior.ownerKey === ownerKey && prior.buildProjectId === request.buildProjectId);
      if(projectLeases.some(prior=>prior.sourceVersion>request.sourceVersion))
        throw new Error("Preview source is stale.");
      const closeAfterFreshAuthority=async (leaseId:string) => {
        // An update may begin while authority is being re-read. Loop until the
        // update fence is clear, then publish close intent synchronously before
        // another update can enter. A newer committed revision always wins.
        for(;;) {
          const before=sharedFullStackPreviews.get(leaseId);
          if(!before)return;
          if(before.ownerKey!==ownerKey || before.buildProjectId!==request.buildProjectId)
            throw new Error("Preview ownership changed.");
          if(before.mode==="development" &&
              sharedFullStackPreviews.developmentUpdatePending(leaseId)) {
            await sharedFullStackPreviews.waitForDevelopmentSettled(leaseId);
            continue;
          }
          await input.authorize(ownerKey,request);
          const current=sharedFullStackPreviews.get(leaseId);
          if(!current)return;
          if(current.ownerKey!==ownerKey || current.buildProjectId!==request.buildProjectId)
            throw new Error("Preview ownership changed.");
          if(current.sourceVersion>request.sourceVersion)
            throw new Error("Preview source is stale.");
          if(current.mode==="development" &&
              sharedFullStackPreviews.developmentUpdatePending(leaseId))continue;
          await sharedFullStackPreviews.close(leaseId);
          return;
        }
      };
      if (mode === "development") {
        // Source/runtime/dependency changes and revision gaps recover from the
        // newly re-attested saved request. Close the one owner/project lease
        // first so a one-slot runner can replace it without overcommit.
        for (const prior of projectLeases) await closeAfterFreshAuthority(prior.id);
      } else {
        for (const prior of projectLeases) {
          if (prior.sourceVersion > request.sourceVersion) throw new Error("Preview source is stale.");
          // Immutable fallback is recovery-only. It must never tear down a
          // healthy development session because a browser socket was briefly
          // unavailable. An active incremental update is not a health failure:
          // settle it, reaffirm authority, then probe the committed revision.
          if (prior.mode === "development") {
            if(sharedFullStackPreviews.developmentUpdatePending(prior.id)) {
              await sharedFullStackPreviews.waitForDevelopmentSettled(prior.id);
              await input.authorize(ownerKey,request);
            }
            const current=sharedFullStackPreviews.get(prior.id);
            if(current?.sourceVersion && current.sourceVersion>request.sourceVersion)
              throw new Error("Preview source is stale.");
            if(current && await sharedFullStackPreviews.checkLive(current.id,checkLeaseHealth))
              throw new Error("Healthy development preview owns this project lifecycle.");
          }
          await closeAfterFreshAuthority(prior.id);
        }
      }
      await reclaimTanstackPreviewCapacity(ownerKey,request.buildProjectId);
      input.onPhase?.("capacity");
      const releasePending = reserveTanstackPreviewCapacity(ownerKey);
      let handle: Awaited<ReturnType<typeof startIsolatedTanstackPreview>> | null = null;
      let driver: TanstackPreviewDriver | null = null;
      try {
        // Mint the capability BEFORE launch, but do not register or expose it
        // until readiness succeeds. This is Vite's trusted per-preview base.
        const previewId = `preview_${randomUUID()}`;
        const previewCorrelation = createHash("sha256").update(previewId).digest("hex").slice(0,16);
        const diagnosticCorrelation = input.operationCorrelation
          ? { operation: input.operationCorrelation, preview: previewCorrelation } : undefined;
        const publicAccessKey = randomBytes(24).toString("base64url");
        const basePath = `/api/build/projects/${encodeURIComponent(request.buildProjectId)}/preview/${previewId}/content/${publicAccessKey}/`;
        input.onPhase?.("driver_validation");
        const createdDriver = input.driverFactory
          ? input.driverFactory(request, basePath)
          : makeTanstackPreviewDockerDriver(
              ownerKey, request, basePath, input.identity, input.telemetry,
              undefined, diagnosticCorrelation,
              // The public gateway is separately authenticated and the
              // iframe transport must be explicitly approved at deployment.
              // No feature flag changes immutable preview behavior.
              {mode,websocketGatewayReady:mode==="development" &&
                process.env.RUNNER_EXECUTION_POOL==="zoebuild" &&
                process.env.ZOEBUILD_DEVELOPMENT_HMR_GATEWAY_ENABLED==="true" &&
                process.env.ZOEBUILD_NATIVE_IFRAME_HMR_VERIFIED==="true"},
            );
        driver = createdDriver;
        handle = await startIsolatedTanstackPreview(createdDriver,{
          signal:input.signal,onPhase:input.onPhase,telemetry:input.telemetry,
          diagnosticCorrelation,
        });
        if (input.signal?.aborted) throw new Error("Preview cancelled.");
        // A long Vite readiness cycle can outlive a saved revision. Before
        // publishing any mutable lease, re-read the authoritative DB source.
        // Failure tears the new sandbox down rather than registering stale code.
        if (mode === "development") {
          await input.authorize(ownerKey, request);
          if (input.signal?.aborted) throw new Error("Preview cancelled.");
        }
        const createdAt = Date.now();
        const owned = handle;
        // Mint the trusted handle only from the ready Docker driver's result.
        // Existing preview operations always select `immutable` and cannot
        // register an update-capable workspace through HTTP request claims.
        if (mode === "development") trustedTanstackDevelopmentWorkspaces.registerFromDriver({
          previewId, ownerKey, buildProjectId:request.buildProjectId,
          containerId:owned.containerId, workspaceRoot:env.workspaceRoot,
          workspaceDir:owned.workspaceDir,
        });
        try {
          if (mode === "development") trustedTanstackDevelopmentSources.registerFromAdmittedStart({
            previewId, ownerKey, buildProjectId:request.buildProjectId,
            containerId:owned.containerId, source:request,
          });
          sharedFullStackPreviews.register({
            id:previewId, mode, ownerKey, buildProjectId:request.buildProjectId,
            sourceVersion:request.sourceVersion, identity:input.identity,
            containerId:owned.containerId, basePath, createdAt, lastActivityAt:createdAt,
            close: async () => {
              // A failed stop leaves the handle and registry capacity reserved.
              await stopIsolatedTanstackPreview(createdDriver,owned);
              if (mode === "development") {
                trustedTanstackDevelopmentWorkspaces.revoke(previewId,owned.containerId);
                trustedTanstackDevelopmentSources.revoke(previewId,owned.containerId);
              }
            },
          });
        } catch (error) {
          if (mode === "development") {
            trustedTanstackDevelopmentWorkspaces.revoke(previewId,owned.containerId);
            trustedTanstackDevelopmentSources.revoke(previewId,owned.containerId);
          }
          throw error;
        }
        return {previewId,buildProjectId:request.buildProjectId,sourceVersion:request.sourceVersion,
          port:5173 as const,basePath};
      } catch (error) {
        if (error instanceof TanstackPreviewCleanupError) {
          // Startup never returned a handle, but Docker/workspace teardown
          // failed. Quarantine a non-routable lease; capacity remains held.
          const id = `preview_${randomUUID()}`;
          const now = Date.now();
          sharedFullStackPreviews.register({
            id, ownerKey, buildProjectId: request.buildProjectId,
            sourceVersion: request.sourceVersion,
            identity: input.identity,
            containerId: error.orphan.containerId ?? "orphan-workspace",
            basePath: `/quarantined/${id}/`,
            createdAt: now - 60 * 60_000, lastActivityAt: now - 10 * 60_000,
            close: error.recover,
          });
          throw new Error("Preview failed; sandbox cleanup requires reconciliation.", { cause: error });
        }
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
              identity:input.identity,
              containerId:held.containerId,basePath:`/quarantined/${id}/`,
              createdAt:now-60*60_000,lastActivityAt:now-10*60_000,
              close:()=>stopIsolatedTanstackPreview(controller,held),
            });
            throw new Error("Preview failed; sandbox cleanup requires reconciliation.",{cause:error});
          }
        }
        throw error;
      } finally { releasePending(); }
    } finally { endLifecycleStart(); endStart(); }
  }); }
  catch (error) {
    endQueue?.(input.signal?.aborted ? "cancelled" : "error");
    throw error;
  }
}

/** Existing public operation path. Always creates an immutable preview. */
export function startAdmittedTanstackPreview(input: AdmittedPreviewStartInput) {
  return startAdmittedPreviewWithMode(input, "immutable");
}

const DEVELOPMENT_PREVIEW_IDLE_MS = 10 * 60_000;
let developmentSweepTimer: ReturnType<typeof setInterval> | null = null;
function ensureZoebuildDevelopmentLeaseSweeper() {
  if (developmentSweepTimer || process.env.RUNNER_EXECUTION_POOL !== "zoebuild" ||
      process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_START_ENABLED !== "true") return;
  developmentSweepTimer = setInterval(() => {
    void sharedFullStackPreviews.sweep(Date.now(),
      DEVELOPMENT_PREVIEW_IDLE_MS,TANSTACK_PREVIEW_HARD_LIFETIME_MS).catch(() => undefined);
  },60_000);
  developmentSweepTimer.unref?.();
}

/** Private service startup (Phase 4D), disabled by default in the Runner.
 * The caller must provide DB source attestation and signed-dependency checks.
 * Trusted workspace data comes solely from the Docker driver; these leases
 * remain excluded from the immutable capability and browser proxy routes.
 */
export function startAdmittedTanstackDevelopmentPreview(input: AdmittedPreviewStartInput) {
  ensureZoebuildDevelopmentLeaseSweeper();
  return startAdmittedPreviewWithMode(input, "development");
}

/** Fast path for an already-ready exact lease. It runs before the cold-start
 * coordinator and capacity reservation, but still reauthorizes the signed
 * source and participates in the project-deletion drain gate. */
export async function reuseAdmittedTanstackPreview(input: Readonly<{
  ownerKey: string;
  request: ProductionBuildJobRequestV1;
  identity: TanstackPreviewIdentity;
  authorize: (ownerKey: string, request: ProductionBuildJobRequestV1) => Promise<void>;
  telemetry?: PreviewOperationTelemetry;
}>) {
  if (!input.ownerKey || input.request.stackId !== "tanstack-start-v1" ||
      input.request.templateId !== "tanstack-start-v1" ||
      input.request.operation !== "production-build") {
    throw new Error("Invalid TanStack preview identity.");
  }
  const finishStart = sharedPreviewProjectDrains.beginStart(
    input.ownerKey,input.request.buildProjectId);
  try {
    const endAuthorization = input.telemetry?.begin("runner_authorization");
    try {
      await input.authorize(input.ownerKey,input.request);
      endAuthorization?.("ok");
    } catch (error) {
      endAuthorization?.("error");
      throw error;
    }
    const endHealth = input.telemetry?.begin("reuse_health_check");
    const lease = await sharedFullStackPreviews.claimReusable({
      ownerKey:input.ownerKey,
      buildProjectId:input.request.buildProjectId,
      sourceVersion:input.request.sourceVersion,
      identity:input.identity,
      maxLifetimeMs:TANSTACK_PREVIEW_HARD_LIFETIME_MS,
      healthCheck:checkLeaseHealth,
    });
    endHealth?.(lease ? "ok" : "error");
    if (!lease) return null;
    return {previewId:lease.id,buildProjectId:lease.buildProjectId,
      sourceVersion:lease.sourceVersion,port:5173 as const,basePath:lease.basePath};
  } finally {
    finishStart();
  }
}

async function checkLeaseHealth(lease: Readonly<{containerId:string;basePath:string}>) {
  const safe = normalizeTanstackPreviewHttpRequest({
    basePath:lease.basePath,path:lease.basePath,method:"HEAD",headers:{accept:"text/html"},
  });
  const response = await fetchTanstackHttpInsideSandbox(lease.containerId,{
    ...safe,path:tanstackInternalPreviewPath(lease.basePath,safe),
  });
  return response.status === 200 &&
    /^text\/html(?:\s*;|\s*$)/i.test(response.headers["content-type"] ?? "");
}

export async function verifyAdmittedTanstackPreviewReady(input: Readonly<{
  ownerKey:string;
  preview:{previewId:string;buildProjectId:string;sourceVersion:number;basePath:string};
}>) {
  const lease = sharedFullStackPreviews.get(input.preview.previewId);
  if (!lease || lease.mode === "development" || lease.ownerKey !== input.ownerKey ||
      lease.buildProjectId !== input.preview.buildProjectId ||
      lease.sourceVersion !== input.preview.sourceVersion ||
      lease.basePath !== input.preview.basePath) return false;
  return sharedFullStackPreviews.checkLive(lease.id,checkLeaseHealth);
}

/** Capability-only fetch, with no platform credentials forwarded to generated
 * code. Source version is tied to the live lease, never browser-provided. */
export async function fetchAdmittedTanstackPreview(input: Readonly<{
  previewId:string; path:string; method:"GET"|"HEAD"|"POST";
  headers?: unknown; bodyBase64?:unknown;
}>) {
  const lease=sharedFullStackPreviews.get(input.previewId);
  if (!lease || lease.mode === "development" ||
      lease.basePath.startsWith("/quarantined/")) throw new Error("Preview not found.");
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

/** Resolve only a live, exact TanStack bearer capability. No owner/session
 * credentials are exposed to a read-only browser preview. */
export function resolveAdmittedTanstackPreviewCapability(input: Readonly<{
  previewId: string; path: string;
}>) {
  const lease = sharedFullStackPreviews.get(input.previewId);
  if (!lease || lease.mode === "development" ||
      lease.basePath.startsWith("/quarantined/")) throw new Error("Preview not found.");
  normalizeTanstackPreviewHttpRequest({
    basePath: lease.basePath, path: input.path, method: "GET",
  });
  sharedFullStackPreviews.touch(lease.id, Date.now());
  return { previewId: lease.id, buildProjectId: lease.buildProjectId, sourceVersion: lease.sourceVersion };
}

/** Authenticated owner transport. Unlike the bearer capability path, this
 * permits POST only when the caller supplies the exact current project/source
 * identity verified by the ZoeBuild control plane. No source version can be
 * obtained from the browser and silently substituted at this boundary. */
export async function fetchOwnedTanstackPreview(input: Readonly<{
  ownerKey: string; previewId: string; buildProjectId: string; sourceVersion: number;
  path: string; method: "GET" | "HEAD" | "POST";
  headers?: unknown; bodyBase64?: unknown;
}>) {
  const lease = sharedFullStackPreviews.get(input.previewId);
  if (!lease || lease.mode === "development" ||
      lease.basePath.startsWith("/quarantined/")) throw new Error("Preview not found.");
  if (!input.ownerKey || lease.ownerKey !== input.ownerKey) throw new Error("Forbidden.");
  if (lease.buildProjectId !== input.buildProjectId ||
      !Number.isSafeInteger(input.sourceVersion) || input.sourceVersion < 1 ||
      lease.sourceVersion !== input.sourceVersion) throw new Error("Preview source is stale.");
  const safe = normalizeTanstackPreviewHttpRequest({
    basePath: lease.basePath, path: input.path, method: input.method,
    headers: input.headers, bodyBase64: input.bodyBase64,
  });
  const internalPath = tanstackInternalPreviewPath(lease.basePath, safe);
  const response = await fetchTanstackHttpInsideSandbox(lease.containerId, {...safe, path: internalPath});
  sharedFullStackPreviews.touch(input.previewId, Date.now());
  return response;
}
