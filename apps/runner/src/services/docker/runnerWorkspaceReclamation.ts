import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../lib/env.js";
import { docker } from "./dockerClient.js";

/** Only allocated, immediate children of the configured Runner workspace root. */
const WORKSPACE_NAME = /^zoeskoul-run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REPAIR_TIMEOUT_MS = 60_000;

export type RemovalOperations = {
  remove?: (workspaceDir: string) => Promise<void>;
  repair?: (workspaceDir: string) => Promise<void>;
};

function isPermissionError(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && (error.code === "EACCES" || error.code === "EPERM");
}

async function assertAllocatedWorkspaceDir(candidate: string): Promise<string> {
  const configuredRoot = path.resolve(env.workspaceRoot);
  const actualRoot = await fs.realpath(configuredRoot);
  if (actualRoot !== configuredRoot) {
    throw new Error("RUNNER recovery refused a symlinked workspace root.");
  }
  const resolvedCandidate = path.resolve(candidate);
  const name = path.basename(resolvedCandidate);
  if (!WORKSPACE_NAME.test(name) || path.dirname(resolvedCandidate) !== actualRoot) {
    throw new Error("RUNNER recovery refused a non-allocated workspace path.");
  }
  const entry = await fs.lstat(resolvedCandidate);
  if (!entry.isDirectory() || entry.isSymbolicLink() ||
      await fs.realpath(resolvedCandidate) !== resolvedCandidate) {
    throw new Error("RUNNER recovery refused a symlink or unsafe directory.");
  }
  return resolvedCandidate;
}

/**
 * A one-off, least-scope rootless-Docker metadata helper. UID 0 inside the
 * rootless executor maps to the executor account on the host, not host root.
 * Never expose this helper to a learner or pass a learner-controlled mount.
 * We modify directories only: directory ownership/mode controls unlinking
 * arbitrary child files, including rootless-subuid-owned node_modules.
 * find -P (its default) never follows nested symlinks; -xdev stays on the
 * workspace filesystem. Any unverified result blocks Runner startup.
 */
export function buildRunnerReclamationOptions(workspaceDir: string) {
  const script = [
    "find /workspace -xdev -type d -exec chown -h -- 0:0 {} +",
    "find /workspace -xdev -type d -exec chmod u+rwx -- {} +",
    'unexpected=$(find /workspace -xdev -type d \\( ! -uid 0 -o ! -gid 0 \\) -print -quit)',
    'if [ -n "$unexpected" ]; then echo WORKSPACE_RECLAIM_INCOMPLETE >&2; exit 31; fi',
  ].join("\n");
  return {
    Image: env.runnerImage,
    User: "0:0",
    Entrypoint: ["/bin/sh"],
    Cmd: ["-ec", script],
    OpenStdin: false,
    Tty: false,
    Labels: {
      "com.zoeskoul.runner": "true",
      "com.zoeskoul.runner.purpose": "workspace-reclamation",
    },
    HostConfig: {
      Binds: [`${workspaceDir}:/workspace:rw`],
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      CapAdd: ["CHOWN", "DAC_OVERRIDE", "FOWNER"],
      SecurityOpt: ["no-new-privileges:true"],
      Memory: 128 * 1024 * 1024,
      MemorySwap: 128 * 1024 * 1024,
      CpuPeriod: 100000,
      CpuQuota: 25000,
      PidsLimit: 16,
      Tmpfs: { "/tmp": "rw,nosuid,noexec,size=8m" },
    },
  };
}

export async function repairRunnerWorkspaceForRemoval(workspaceDir: string): Promise<void> {
  const resolved = await assertAllocatedWorkspaceDir(workspaceDir);
  const helper = await docker.createContainer(buildRunnerReclamationOptions(resolved));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await helper.start();
    const result = await Promise.race([
      helper.wait(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("RUNNER workspace reclamation timed out.")), REPAIR_TIMEOUT_MS);
      }),
    ]);
    if (result.StatusCode !== 0) {
      throw new Error(`RUNNER workspace reclamation failed (exit ${result.StatusCode}).`);
    }
  } finally {
    if (timeout) clearTimeout(timeout);
    // A leaked privileged helper is a safety failure; do not swallow it.
    await helper.remove({ force: true });
  }
}

/** Used for startup and TTL cleanup, never a user-facing file operation. */
export async function removeRunnerWorkspaceWithRecovery(
  workspaceDir: string,
  operations: RemovalOperations = {},
): Promise<void> {
  const remove = operations.remove ?? (dir => fs.rm(dir, { recursive: true, force: true }));
  const repair = operations.repair ?? repairRunnerWorkspaceForRemoval;
  try {
    await remove(workspaceDir);
  } catch (error) {
    if (!isPermissionError(error)) throw error;
    await repair(workspaceDir); // Strict path authorization happens before helper creation.
    await remove(workspaceDir); // Failure propagates: startup gate stays closed.
  }
}
