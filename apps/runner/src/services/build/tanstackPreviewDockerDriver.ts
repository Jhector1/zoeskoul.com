import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { docker } from "../docker/dockerClient.js";
import { createWorkspace } from "../workspace/createWorkspace.js";
import { env } from "../../lib/env.js";
import { createTanstackRecoveryJournal, removeTanstackWorkspaceStrict } from "./tanstackPreviewDurableRecovery.js";
import { ensureWorkspaceWritableForShellUser } from "../workspace/workspacePermissions.js";
import { buildProductionBuildContainerOptions, executeBuildStep } from "./executeProductionBuild.js";
import { assertTanstackWorkerBuildRequest } from "./tanstackWorkerBuildPolicy.js";
import {
  TANSTACK_PREVIEW_INSTALL_COMMAND, tanstackPreviewDevCommand,
  assertTanstackSandboxOptions,
} from "./tanstackPreviewRuntimePolicy.js";
import { TanstackPreviewCleanupError, type TanstackPreviewDriver } from "./tanstackPreviewLifecycle.js";
import { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";

/** Internal-only SSR driver. Not registered as a customer preview route.
 * Upstream must own the shared preview-admission lease, owner authorization,
 * source-version check, and source/manifest dependency authorization.
 * In particular, package-manifest approval must not be inferred from these
 * structural checks; do not expose this driver directly to HTTP. */
export function makeTanstackPreviewDockerDriver(request: ProductionBuildJobRequestV1, basePath: string): TanstackPreviewDriver {
  assertTanstackWorkerBuildRequest(request);
  // Validate before preparing a workspace or invoking Docker.
  const command = tanstackPreviewDevCommand(basePath);
  // Journal identity exists BEFORE a workspace is created. Docker labels make
  // create/start crashes discoverable even between container creation and the
  // next journal fsync. The runner must have a single active pool process.
  const journal = createTanstackRecoveryJournal(env.workspaceRoot);
  async function forgetIfEmpty() {
    if (!journal.current.workspaceDir && !journal.current.containerId)
      await journal.clear();
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
  return {
    async prepare() {
      await journal.write();
      let workspaceDir: string | null = null;
      try {
        workspaceDir = await createWorkspace([...request.files], {
          onWorkspaceAllocated: async (allocated) => {
            // Durable identity precedes creation; even an in-flight write or
            // failed rollback leaves a precise recovery record.
            await journal.write({ workspaceDir: allocated });
            workspaceDir = allocated;
          },
        });
      } catch (error) {
        if (workspaceDir) {
          const orphan = workspaceDir;
          try { await removeWorkspace(orphan); }
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
        await ensureWorkspaceWritableForShellUser(preparedWorkspaceDir);
        await executeBuildStep({
          workspaceDir: preparedWorkspaceDir, command: TANSTACK_PREVIEW_INSTALL_COMMAND, step: "install",
          resourceContext: "tanstack-preview-install",
          strictCleanup: true,
          tanstackRunId: journal.runId,
          onContainerCreated: async id => journal.write({containerId:id}),
          onContainerRemoved: async () => journal.write({containerId:null}),
        });
        return preparedWorkspaceDir;
      } catch (error) {
        // A build/install container can outlive its command if Docker removal
        // fails. Never delete its mounted workspace while it might still run.
        const recover = async () => {
          const id = journal.current.containerId;
          if (id) await removeContainer(id);
          await removeWorkspace(preparedWorkspaceDir);
        };
        try { await recover(); }
        catch {
          throw new TanstackPreviewCleanupError(
            { containerId: journal.current.containerId, workspaceDir: journal.current.workspaceDir },
            recover, error);
        }
        throw error;
      }
    },
    async launch(workspaceDir) {
      const base = buildProductionBuildContainerOptions({ workspaceDir,
        command, step: "build" });
      const options = {
        ...base,
        Env: [...base.Env, `ZOEBUILD_PREVIEW_BASE_PATH=${basePath}`],
        Labels: { ...base.Labels, "com.zoeskoul.runner.purpose": "tanstack-start-preview",
          "com.zoeskoul.runner.tanstack-run": journal.runId },
        HostConfig: { ...base.HostConfig, NetworkMode: "none" },
      };
      assertTanstackSandboxOptions(options);
      const container = await docker.createContainer(options);
      try {
        await journal.write({ containerId: container.id });
        await container.start();
        return container.id;
      } catch (error) {
        try { await removeContainer(container.id); }
        catch {
          throw new TanstackPreviewCleanupError(
            { containerId: container.id, workspaceDir: null },
            () => removeContainer(container.id), error);
        }
        throw error;
      }
    },
    async probe(containerId) {
      return fetchTanstackHttpInsideSandbox(containerId, {
        method: "GET", path: basePath, headers: { accept: "text/html" }, bodyBase64: "",
      });
    },
    destroy: removeContainer,
    cleanup: removeWorkspace,
    now: Date.now,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  };
}
