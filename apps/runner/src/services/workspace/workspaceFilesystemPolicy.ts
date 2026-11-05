import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../lib/env.js";

/**
 * ZoeBuild shared-group workspace policy. This mode is intentionally opt-in:
 * rootless Docker maps namespace GID 0 to the dedicated executor host GID,
 * while the sandbox remains a non-root UID with all capabilities dropped.
 * Never enable in the Learning pool or with an unverified rootless mapping.
 */
export function sharedGroupWorkspaceEnabled(): boolean {
  return env.workspaceFilesystemPolicy === "shared-group-v1";
}

export function workspaceDirectoryMode(): number {
  return sharedGroupWorkspaceEnabled() ? 0o2770 : 0o777;
}

export function workspaceFileMode(): number {
  return sharedGroupWorkspaceEnabled() ? 0o660 : 0o666;
}

/** Preserve authored executable files without granting other-user access. */
export function managedWorkspaceFileMode(existing: number | null): number {
  if (!sharedGroupWorkspaceEnabled()) return existing ?? 0o666;
  return 0o660 | (existing !== null && (existing & 0o111) !== 0 ? 0o110 : 0);
}

/** Only the runner-owned image entrypoint interprets this privileged flag. */
export function workspaceRuntimeEnvironment(): string[] {
  return sharedGroupWorkspaceEnabled()
    ? ["RUNNER_WORKSPACE_FS_POLICY=shared-group-v1", "UMASK=007"]
    : [];
}

/**
 * The shared-group policy is supported only by POSIX hosts. Node makes these
 * APIs optional in its TypeScript definitions, so require both explicitly.
 * If either is missing, fail closed before touching workspace permissions.
 */
function requirePosixHostIdentity(): { uid: number; gid: number } {
  const getuid = process.getuid;
  const getgid = process.getgid;
  if (typeof getuid !== "function" || typeof getgid !== "function") {
    throw new Error("Shared-group workspace policy requires POSIX host identity APIs.");
  }
  return { uid: getuid(), gid: getgid() };
}

/**
 * Do not chmod a sandbox-owned subtree as the runner service: rootless UID
 * mapping makes that operation invalid, and running chmod -R breaks quotas.
 * Existing sandbox directories must already follow the private group policy.
 */
export async function ensureManagedWorkspaceDirectory(dir: string): Promise<void> {
  const mode = workspaceDirectoryMode();
  if (!sharedGroupWorkspaceEnabled()) {
    await fs.mkdir(dir, { recursive: true, mode });
    await fs.chmod(dir, mode).catch(() => {});
    return;
  }

  const { uid: hostUid, gid: hostGid } = requirePosixHostIdentity();

  // Every intermediate directory must be group-writable too. A single
  // recursive mkdir + final chmod can leave src/ at 2750 (host umask 0022),
  // preventing the sandbox from writing src/ even if src/components is 2770.
  const root = path.resolve(env.workspaceRoot);
  const target = path.resolve(dir);
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Shared-group workspace directory escapes the configured workspace root.");
  }

  const paths = [root];
  if (relative) {
    let current = root;
    for (const component of relative.split(path.sep)) {
      current = path.join(current, component);
      paths.push(current);
    }
  }

  for (const directory of paths) {
    try {
      await fs.mkdir(directory, { recursive: directory === root, mode });
    } catch (error: unknown) {
      if (typeof error !== "object" || error === null || !("code" in error) ||
          error.code !== "EEXIST") throw error;
    }
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("Unsafe managed workspace directory.");
    }
    if (stat.gid !== hostGid) {
      throw new Error("Workspace directory does not belong to the dedicated executor group.");
    }
    if (stat.uid === hostUid) {
      await fs.chmod(directory, mode);
    } else if ((stat.mode & 0o7777) !== mode) {
      throw new Error("Sandbox-owned workspace directory violates the private group policy.");
    }
  }
}

export async function verifyPrivateWorkspaceRoot(dir: string): Promise<void> {
  if (!sharedGroupWorkspaceEnabled()) return;
  const { uid: hostUid, gid: hostGid } = requirePosixHostIdentity();
  const stat = await fs.lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== hostUid ||
      stat.gid !== hostGid || (stat.mode & 0o7777) !== 0o2770) {
    throw new Error("Workspace root is not private to the dedicated executor group.");
  }
}
