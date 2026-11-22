import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../lib/env.js";
import { docker } from "./dockerClient.js";
import { clearReconciledTanstackJournals } from "../build/tanstackPreviewDurableRecovery.js";
import { removeRunnerWorkspaceWithRecovery } from "./runnerWorkspaceReclamation.js";
import { cleanupOrphanedAdminWorkspaceVolumes } from "../execution/adminWorkspaceVolume.js";
import { cleanupOrphanedAdminSessionNetworks } from "../execution/adminSessionNetwork.js";

import { assertNoUnifiedStartupResources, assertUnifiedStartupReservations, unifiedVolumeMarker } from "../execution/unifiedLinuxStartupGuard.js";

type ListRunnerContainersOptions = {
  all: boolean;
  filters: {
    label: string[];
  };
};

type RunnerContainerInfo = {
  Id: string;
  State?: string;
  Labels?: Record<string,string>;
};

function listRunnerContainers(): Promise<RunnerContainerInfo[]> {
  const listOptions: ListRunnerContainersOptions = {
    all: true,
    filters: {
      label: ["com.zoeskoul.runner=true"],
    },
  };

  const dockerWithCallbackList = docker as unknown as {
    listContainers: (
        options: ListRunnerContainersOptions,
        callback: (
            error: Error | null,
            containers?: RunnerContainerInfo[],
        ) => void,
    ) => void;
  };

  return new Promise((resolve, reject) => {
    dockerWithCallbackList.listContainers(listOptions, (error, containers = []) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(containers);
    });
  });
}

/** Restart means no in-memory lease can still be authoritative. Docker is
 * reaped before directories, so running code never retains an active bind to
 * a workspace the reaper has removed. Fail closed on ANY unverified removal.
 * One dedicated rootless Docker socket per execution pool is mandatory. */
export async function cleanupOrphanedRunnerContainers() {
  assertUnifiedStartupReservations();
  const containers = await listRunnerContainers();
  assertNoUnifiedStartupResources(containers);
  const volumes = await docker.listVolumes({ filters: { label: [unifiedVolumeMarker] } });
  assertNoUnifiedStartupResources(volumes.Volumes ?? []);
  const failures: unknown[] = [];
  const isHolder = (info: RunnerContainerInfo) => info.Labels?.["com.zoeskoul.runner.lab-mode"] === "admin-egress-holder";
  async function remove(info: RunnerContainerInfo) {
    try {
      await docker.getContainer(info.Id).remove({ force: true });
    } catch (error) {
      if (typeof error !== "object" || error === null ||
          !("statusCode" in error) || error.statusCode !== 404) {
        failures.push(error);
        console.error("RUNNER startup Docker resource still present", {id: info.Id.slice(0, 12)});
      }
    }
  }
  const holders = containers.filter(isHolder);
  for (const info of containers.filter(info => !isHolder(info))) await remove(info);
  // Keep namespace holders (and their firewall) alive until an independent
  // enumeration verifies every dependent is absent, not just a 204 response.
  if (holders.length && !failures.length) {
    const beforeHolders = await listRunnerContainers();
    assertNoUnifiedStartupResources(beforeHolders);
    if (beforeHolders.some(info => !isHolder(info))) {
      throw new Error("RUNNER startup Docker cleanup incomplete (dependent remains before holder cleanup).");
    }
    for (const info of holders) await remove(info);
  }
  // A failed daemon list is already fatal. Verify the pool-wide label filter
  // is empty even if remove() returned success: 204 is not proof of absence.
  const remaining = await listRunnerContainers();
  assertNoUnifiedStartupResources(remaining);
  if (failures.length || remaining.length) {
    throw new Error(`RUNNER startup Docker cleanup incomplete (${failures.length} errors, ${remaining.length} remaining).`);
  }
}

export async function cleanupAllRunnerWorkspaceDirs() {
  const root = env.workspaceRoot;
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.name.startsWith("zoeskoul-run-")) continue;
    // A prefixed symlink or non-directory is not a normal sandbox workspace.
    // Never follow it or advertise readiness while the root is contaminated.
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error("Unsafe Runner startup workspace entry.");
    const abs = path.join(root, entry.name);
    await removeRunnerWorkspaceWithRecovery(abs);
  }
  const remaining = (await fs.readdir(root)).filter(name => name.startsWith("zoeskoul-run-"));
  if (remaining.length) throw new Error("RUNNER startup workspace cleanup incomplete.");
}


export async function cleanupExpiredWorkspaceDirs() {
  const root = env.workspaceRoot;
  await fs.mkdir(root, { recursive: true }).catch(() => {});

  const entries = await fs
      .readdir(root, { withFileTypes: true })
      .catch(() => []);
  const cutoff = Date.now() - env.workspaceTtlMs;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("zoeskoul-run-")) continue;

    const abs = path.join(root, entry.name);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) continue;
    if (stat.mtimeMs > cutoff) continue;

    await removeRunnerWorkspaceWithRecovery(abs).catch((err) => {
      console.error("RUNNER orphan workspace cleanup failed", {
        workspace: entry.name,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

export async function cleanupRunnerOrphansOnStartup() {
  // Complete ALL resource removal before releasing the startup gate. Never
  // ignore Docker failures or discard the durable journal before teardown.
  await cleanupOrphanedRunnerContainers();
  await cleanupOrphanedAdminSessionNetworks();
  await cleanupOrphanedAdminWorkspaceVolumes();
  await cleanupAllRunnerWorkspaceDirs();
  await clearReconciledTanstackJournals(env.workspaceRoot);
}
