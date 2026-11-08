import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { docker } from "../docker/dockerClient.js";
import { createWorkspace } from "../workspace/createWorkspace.js";
import { env } from "../../lib/env.js";
import { createTanstackRecoveryJournal, removeTanstackWorkspaceStrict } from "./tanstackPreviewDurableRecovery.js";
import { ensureWorkspaceWritableForShellUser } from "../workspace/workspacePermissions.js";
import { buildProductionBuildContainerOptions, executeBuildStep } from "./executeProductionBuild.js";
import { assertTanstackWorkerBuildRequest } from "./tanstackWorkerBuildPolicy.js";
import {
  TANSTACK_PREVIEW_INSTALL_COMMAND, tanstackPreviewDevCommand,
  TANSTACK_PREVIEW_OFFLINE_ENV, assertTanstackSandboxOptions,
} from "./tanstackPreviewRuntimePolicy.js";
import { TanstackPreviewCleanupError, type TanstackPreviewDriver } from "./tanstackPreviewLifecycle.js";
import { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";
import { previewObservability, type PreviewOperationTelemetry } from "./previewObservability.js";
import type { TanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";
import {
  PreviewDependencyLayerStore,
  previewDependencyLayerKey,
  previewDependencyLayerStore,
  type DependencyLayerLease,
} from "./previewDependencyLayerStore.js";
import { resolveSandboxProfile } from "../execution/sandboxProfile.js";

export function tanstackPreviewDependencyKey(
  ownerKey: string,
  request: ProductionBuildJobRequestV1,
  identity: TanstackPreviewIdentity,
) {
  const installOptions = buildProductionBuildContainerOptions({
    workspaceDir: "/dependency-identity",
    command: TANSTACK_PREVIEW_INSTALL_COMMAND,
    step: "install",
    resourceContext: "tanstack-preview-install",
  });
  const installPolicyFingerprint = createHash("sha256").update(JSON.stringify([
    "tanstack-preview-install-policy-v1",
    "linux-container",
    process.arch,
    installOptions.Cmd,
    installOptions.WorkingDir,
    installOptions.User,
    installOptions.Env,
    installOptions.HostConfig.NetworkMode,
    installOptions.HostConfig.ReadonlyRootfs,
    installOptions.HostConfig.CapDrop,
    installOptions.HostConfig.SecurityOpt,
  ])).digest("hex");
  return previewDependencyLayerKey({
    actorKey: ownerKey,
    projectId: request.buildProjectId,
    dependencyFingerprint: identity.dependencyFingerprint,
    command: TANSTACK_PREVIEW_INSTALL_COMMAND,
    imageId: identity.runtimeImageId,
    installPolicyFingerprint,
  });
}

/** One authorized dependency decision. A hit never calls install; a miss
 * keeps the caller's private tree and publishes only a detached verified copy. */
export async function prepareTanstackPreviewDependencies(input: Readonly<{
  store: PreviewDependencyLayerStore;
  key: string;
  workspaceDir: string;
  install: () => Promise<void>;
  telemetry?: PreviewOperationTelemetry;
}>): Promise<Readonly<{ mode: "hit" | "private-install"; lease: DependencyLayerLease | null }>> {
  const cached = await input.store.lookup(input.key);
  if (cached.lease) {
    input.telemetry?.skipped("dependency_install", "cache_hit");
    return { mode: "hit", lease: cached.lease };
  }
  const endDependency = input.telemetry?.begin("dependency_install");
  const endInstallMetric = previewObservability.beginDependencyInstall();
  try {
    await input.install();
    endDependency?.("ok");
    endInstallMetric("ok");
  } catch (error) {
    endDependency?.("error");
    endInstallMetric("error");
    throw error;
  }
  const published = await input.store.publish(input.key, input.workspaceDir);
  published?.release();
  return { mode: "private-install", lease: null };
}

/** Internal-only SSR driver. Not registered as a customer preview route.
 * Upstream must own the shared preview-admission lease, owner authorization,
 * source-version check, and source/manifest dependency authorization.
 * In particular, package-manifest approval must not be inferred from these
 * structural checks; do not expose this driver directly to HTTP. */
export function makeTanstackPreviewDockerDriver(
  ownerKey: string,
  request: ProductionBuildJobRequestV1,
  basePath: string,
  identity: TanstackPreviewIdentity,
  telemetry?: PreviewOperationTelemetry,
  dependencyStore: PreviewDependencyLayerStore = previewDependencyLayerStore,
  diagnosticCorrelation?: Readonly<{operation:string;preview:string}>,
): TanstackPreviewDriver {
  if (!ownerKey) throw new Error("TanStack preview owner identity required.");
  if (diagnosticCorrelation &&
      (!/^[a-f0-9]{16}$/.test(diagnosticCorrelation.operation) ||
       !/^[a-f0-9]{16}$/.test(diagnosticCorrelation.preview))) {
    throw new Error("Invalid preview diagnostic correlation.");
  }
  assertTanstackWorkerBuildRequest(request);
  // Validate before preparing a workspace or invoking Docker.
  const command = tanstackPreviewDevCommand(basePath);
  // Journal identity exists BEFORE a workspace is created. Docker labels make
  // create/start crashes discoverable even between container creation and the
  // next journal fsync. The runner must have a single active pool process.
  const journal = createTanstackRecoveryJournal(env.workspaceRoot);
  const dependencyKey = tanstackPreviewDependencyKey(ownerKey, request, identity);
  let dependencyLease: DependencyLayerLease | null = null;
  let mountedContainerId: string | null = null;
  function releaseDependencyLease() {
    dependencyLease?.release();
    dependencyLease = null;
  }
  async function forgetIfEmpty() {
    if (!journal.current.workspaceDir && !journal.current.containerId)
      await journal.clear();
  }
  async function measuredCleanup(task: () => Promise<void>) {
    const finish = previewObservability.beginCleanup();
    try {
      await task();
      finish("ok");
    } catch (error) {
      finish("error");
      throw error;
    }
  }
  async function removeContainer(id: string) {
    try { await docker.getContainer(id).remove({ force: true }); }
    catch (error) {
      if (!(typeof error === "object" && error !== null &&
          "statusCode" in error && error.statusCode === 404)) throw error;
    }
    await journal.write({ containerId: null });
    await forgetIfEmpty();
  }
  async function removeWorkspace(dir: string) {
    await removeTanstackWorkspaceStrict(env.workspaceRoot, dir);
    await journal.write({ workspaceDir: null });
    await forgetIfEmpty();
  }
  async function removePreviewContainer(id: string) {
    await removeContainer(id);
    if (mountedContainerId === id) mountedContainerId = null;
    releaseDependencyLease();
  }
  return {
    async prepare() {
      await journal.write();
      let workspaceDir: string | null = null;
      const endWorkspace = telemetry?.begin("workspace_create");
      try {
        workspaceDir = await createWorkspace([...request.files], {
          onWorkspaceAllocated: async (allocated) => {
            // Durable identity precedes creation; even an in-flight write or
            // failed rollback leaves a precise recovery record.
            await journal.write({ workspaceDir: allocated });
            workspaceDir = allocated;
          },
        });
        endWorkspace?.("ok");
      } catch (error) {
        endWorkspace?.("error");
        if (workspaceDir) {
          const orphan = workspaceDir;
          try { await measuredCleanup(() => removeWorkspace(orphan)); }
          catch {
            throw new TanstackPreviewCleanupError(
              { containerId: null, workspaceDir: orphan },
              () => removeWorkspace(orphan), error);
          }
        } else {
          await journal.clear();
        }
        throw error;
      }
      // Capture a stable non-null identity for deferred recovery closures.
      const preparedWorkspaceDir = workspaceDir;
      if (!preparedWorkspaceDir) throw new Error("TanStack workspace allocation was not recorded.");
      try {
        const dependencies = await prepareTanstackPreviewDependencies({
          store: dependencyStore,
          key: dependencyKey,
          workspaceDir: preparedWorkspaceDir,
          telemetry,
          install: async () => {
            await ensureWorkspaceWritableForShellUser(preparedWorkspaceDir);
            await executeBuildStep({
              workspaceDir: preparedWorkspaceDir,
              command: TANSTACK_PREVIEW_INSTALL_COMMAND,
              step: "install",
              resourceContext: "tanstack-preview-install",
              strictCleanup: true,
              tanstackRunId: journal.runId,
              onContainerCreated: async id => journal.write({containerId:id}),
              onContainerRemoved: async () => journal.write({containerId:null}),
              immutableImageId: identity.runtimeImageId,
            });
          },
        });
        dependencyLease = dependencies.lease;
        return preparedWorkspaceDir;
      } catch (error) {
        // A build/install container can outlive its command if Docker removal
        // fails. Never delete its mounted workspace while it might still run.
        const recover = async () => {
          const id = journal.current.containerId;
          if (id) await removeContainer(id);
          await removeWorkspace(preparedWorkspaceDir);
        };
        try { await measuredCleanup(recover); }
        catch {
          throw new TanstackPreviewCleanupError(
            { containerId: journal.current.containerId, workspaceDir: journal.current.workspaceDir },
            recover, error);
        }
        throw error;
      }
    },
    async launch(workspaceDir) {
      const endLaunch = telemetry?.begin("container_launch");
      try {
        const base = buildProductionBuildContainerOptions({ workspaceDir,
          command, step: "build" });
        const dependencyBind = dependencyLease
          ? PreviewDependencyLayerStore.bind(dependencyLease) : null;
        const cacheOwner = resolveSandboxProfile("build").user.split(":");
        if (cacheOwner.length !== 2 || cacheOwner.some(value => !/^\d+$/.test(value)))
          throw new Error("Invalid TanStack preview cache owner.");
        const [cacheUid, cacheGid] = cacheOwner;
        const options = {
          ...base,
          Image: identity.runtimeImageId,
          Env: [
            ...base.Env,
            `ZOEBUILD_PREVIEW_BASE_PATH=${basePath}`,
            TANSTACK_PREVIEW_OFFLINE_ENV,
          ],
          Labels: { ...base.Labels, "com.zoeskoul.runner.purpose": "tanstack-start-preview",
            "com.zoeskoul.runner.tanstack-run": journal.runId,
            ...(diagnosticCorrelation ? {
              "com.zoeskoul.runner.operation-correlation": diagnosticCorrelation.operation,
              "com.zoeskoul.runner.preview-correlation": diagnosticCorrelation.preview,
            } : {}),
          },
          HostConfig: {
            ...base.HostConfig,
            NetworkMode: "none",
            Binds: dependencyBind
              ? [...base.HostConfig.Binds, dependencyBind]
              : [...base.HostConfig.Binds],
            Tmpfs: dependencyBind ? {
              ...base.HostConfig.Tmpfs,
              "/workspace/node_modules/.vite":
                `rw,noexec,nosuid,nodev,size=64m,uid=${cacheUid},gid=${cacheGid},mode=0700`,
              "/workspace/node_modules/.vite-temp":
                `rw,noexec,nosuid,nodev,size=16m,uid=${cacheUid},gid=${cacheGid},mode=0700`,
            } : { ...base.HostConfig.Tmpfs },
          },
        };
        assertTanstackSandboxOptions(options);
        const container = await docker.createContainer(options);
        mountedContainerId = dependencyBind ? container.id : null;
        try {
          await journal.write({ containerId: container.id });
          await container.start();
          endLaunch?.("ok");
          return container.id;
        } catch (error) {
          try { await measuredCleanup(() => removePreviewContainer(container.id)); }
          catch {
            throw new TanstackPreviewCleanupError(
              { containerId: container.id, workspaceDir: null },
              () => removePreviewContainer(container.id), error);
          }
          throw error;
        }
      } catch (error) {
        endLaunch?.("error");
        if (!mountedContainerId) releaseDependencyLease();
        throw error;
      }
    },
    async probe(containerId) {
      return fetchTanstackHttpInsideSandbox(containerId, {
        method: "GET", path: basePath, headers: { accept: "text/html" }, bodyBase64: "",
      });
    },
    destroy: removePreviewContainer,
    cleanup: async dir => {
      await removeWorkspace(dir);
      // Cancellation or create failure can occur after a cache hit but before
      // Docker owns the mount. A failed container teardown keeps this non-null.
      if (!mountedContainerId) releaseDependencyLease();
    },
    now: () => performance.now(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  };
}
