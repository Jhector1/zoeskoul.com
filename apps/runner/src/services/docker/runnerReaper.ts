import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../lib/env.js";
import { docker } from "./dockerClient.js";

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

export async function cleanupOrphanedRunnerContainers() {
  const containers = await listRunnerContainers();

  for (const info of containers) {
    const container = docker.getContainer(info.Id);
    try {
      if (info.State === "running") {
        await container.kill().catch(() => {});
      }
      await container.remove({ force: true }).catch(() => {});
    } catch (err) {
      console.error("RUNNER orphan container cleanup failed", {
        id: info.Id.slice(0, 12),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
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

    await fs.rm(abs, { recursive: true, force: true }).catch((err) => {
      console.error("RUNNER orphan workspace cleanup failed", {
        workspace: entry.name,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

export async function cleanupRunnerOrphansOnStartup() {
  await cleanupOrphanedRunnerContainers();
  await cleanupExpiredWorkspaceDirs();
}
