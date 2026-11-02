import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { docker } from "../docker/dockerClient.js";
import { createWorkspace } from "../workspace/createWorkspace.js";
import { cleanupWorkspaceNow } from "../workspace/cleanupWorkspace.js";
import { ensureWorkspaceWritableForShellUser } from "../workspace/workspacePermissions.js";
import { buildProductionBuildContainerOptions, executeBuildStep } from "./executeProductionBuild.js";
import { assertTanstackWorkerBuildRequest } from "./tanstackWorkerBuildPolicy.js";
import {
  TANSTACK_PREVIEW_DEV_COMMAND, TANSTACK_PREVIEW_INSTALL_COMMAND,
  assertTanstackSandboxOptions,
} from "./tanstackPreviewRuntimePolicy.js";
import type { TanstackPreviewDriver } from "./tanstackPreviewLifecycle.js";
import { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";

/** Internal-only SSR driver. Not registered as a customer preview route.
 * Upstream must own the shared preview-admission lease, owner authorization,
 * source-version check, and source/manifest dependency authorization.
 * In particular, package-manifest approval must not be inferred from these
 * structural checks; do not expose this driver directly to HTTP. */
export function makeTanstackPreviewDockerDriver(request: ProductionBuildJobRequestV1): TanstackPreviewDriver {
  assertTanstackWorkerBuildRequest(request);
  return {
    async prepare() {
      const workspaceDir = await createWorkspace([...request.files]);
      try {
        await ensureWorkspaceWritableForShellUser(workspaceDir);
        await executeBuildStep({ workspaceDir, command: TANSTACK_PREVIEW_INSTALL_COMMAND, step: "install" });
        return workspaceDir;
      } catch (error) {
        try { await cleanupWorkspaceNow(workspaceDir); }
        catch { throw new Error("TanStack dependency setup failed and workspace cleanup needs reconciliation.", { cause: error }); }
        throw error;
      }
    },
    async launch(workspaceDir) {
      // Reuse the hardened build profile and explicitly remove network access.
      const base = buildProductionBuildContainerOptions({ workspaceDir,
        command: TANSTACK_PREVIEW_DEV_COMMAND, step: "build" });
      const options = {
        ...base,
        Labels: { ...base.Labels, "com.zoeskoul.runner.purpose": "tanstack-start-preview" },
        HostConfig: { ...base.HostConfig, NetworkMode: "none" },
      };
      assertTanstackSandboxOptions(options);
      const container = await docker.createContainer(options);
      try {
        await container.start();
        return container.id;
      } catch (error) {
        try { await container.remove({ force: true }); }
        catch { throw new Error("TanStack preview launch failed and container cleanup needs reconciliation.", { cause: error }); }
        throw error;
      }
    },
    async probe(containerId) {
      return fetchTanstackHttpInsideSandbox(containerId, {
        method: "GET", path: "/", headers: { accept: "text/html" }, bodyBase64: "",
      });
    },
    async destroy(containerId) {
      try { await docker.getContainer(containerId).remove({ force: true }); }
      catch (error) {
        // Another teardown may already have removed Docker resources. A
        // genuine daemon error must retain the capacity lease for retry.
        if (!(typeof error === "object" && error !== null &&
              "statusCode" in error && error.statusCode === 404)) throw error;
      }
    },
    cleanup: cleanupWorkspaceNow,
    now: Date.now,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  };
}
