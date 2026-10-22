import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../lib/env.js";
import { resolveSandboxProfile } from "../execution/sandboxProfile.js";
import { docker } from "../docker/dockerClient.js";

/**
 * A trusted, short-lived metadata-only repair. Student terminals always run as
 * their unprivileged UID. This container is never connected to a student PTY,
 * and it receives only the resolved, runner-allocated workspace bind mount.
 *
 * On rootless Docker, UID 0 in this *helper's* namespace is not host root.
 * CAP_CHOWN is granted solely for this bounded operation, not to the learner.
 * Rootless bind mounts can still reject chown; we fail closed in that case.
 */
const REPAIR_TIMEOUT_MS = 20_000;

export function buildOwnershipRepairOptions(workspaceDir: string) {
  const profile = resolveSandboxProfile("learn");
  const uid = env.execUid;
  const gid = env.execGid;

  // uid/gid have already been validated as nonnegative integers by envSchema.
  const script = [
    `chown -hR -P -- ${uid}:${gid} /workspace`,
    `unexpected=$(find /workspace -xdev \\( ! -uid ${uid} -o ! -gid ${gid} \\) -print -quit )`,
    `if [ -n "$unexpected" ]; then`,
    `  echo 'WORKSPACE_OWNERSHIP_INCOMPLETE' >&2; exit 31`,
    `fi`,
  ].join("\n");

  return {
    Image: profile.image,
    User: "0:0", // ONLY the trusted helper, never the student container
    Entrypoint: ["/bin/sh"],
    Cmd: ["-ec", script],
    OpenStdin: false,
    Tty: false,
    Labels: {
      "com.zoeskoul.runner": "true",
      "com.zoeskoul.runner.purpose": "workspace-ownership-repair",
    },
    HostConfig: {
      Binds: [`${workspaceDir}:/workspace:rw`],
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      CapAdd: ["CHOWN"],
      SecurityOpt: ["no-new-privileges:true"],
      Memory: Math.min(profile.memoryBytes, 128 * 1024 * 1024),
      MemorySwap: Math.min(profile.memoryBytes, 128 * 1024 * 1024),
      CpuPeriod: 100000,
      CpuQuota: Math.min(profile.cpuQuota, 25000),
      PidsLimit: 16,
      Tmpfs: { "/tmp": "rw,nosuid,noexec,size=8m" },
    },
  };
}

async function assertRunnerWorkspace(workspaceDir: string) {
  const base = await fs.realpath(env.workspaceRoot);
  const resolved = await fs.realpath(workspaceDir);
  const rel = path.relative(base, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel) ||
      !/^zoeskoul-run-[0-9a-f-]{36}$/.test(rel)) {
    throw new Error("Workspace ownership repair refused a non-runner workspace path.");
  }
  const entry = await fs.lstat(workspaceDir);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error("Workspace ownership repair requires an actual workspace directory.");
  }
  return resolved;
}

export async function repairSandboxWorkspaceOwnership(workspaceDir: string) {
  if (!env.workspaceOwnershipRepairEnabled) return;
  const resolved = await assertRunnerWorkspace(workspaceDir);
  const container = await docker.createContainer(buildOwnershipRepairOptions(resolved));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await container.start();
    const result = await Promise.race([
      container.wait(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Workspace ownership repair timed out.")), REPAIR_TIMEOUT_MS);
      }),
    ]);
    if (result.StatusCode !== 0) {
      throw new Error(`Workspace ownership repair failed (status ${result.StatusCode}); sandbox start/sync blocked.`);
    }
  } finally {
    if (timeout) clearTimeout(timeout);
    await container.remove({ force: true }).catch(() => undefined);
  }
}
