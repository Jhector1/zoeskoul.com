import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../lib/env.js";
import { docker } from "./dockerClient.js";
import { clearReconciledTanstackJournals } from "../build/tanstackPreviewDurableRecovery.js";
import { removeRunnerWorkspaceWithRecovery } from "./runnerWorkspaceReclamation.js";

type ListRunnerContainersOptions = {
  all: boolean;
  filters: {
    label: string[];
  };
};

type RunnerContainerInfo = {
  Id: string;
  State?: string;
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
  const containers = await listRunnerContainers();
  const failures: unknown[] = [];
  for (const info of containers) {
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
  // A failed daemon list is already fatal. Verify the pool-wide label filter
  // is empty even if remove() returned success: 204 is not proof of absence.
  const remaining = await listRunnerContainers();
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
  await cleanupAllRunnerWorkspaceDirs();
  await clearReconciledTanstackJournals(env.workspaceRoot);
}
