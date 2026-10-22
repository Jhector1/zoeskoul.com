import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { env } from "../../lib/env.js";

const execFileAsync = promisify(execFile);

async function runBestEffort(command: string, args: string[]) {
  try {
    await execFileAsync(command, args);
    return true;
  } catch (err) {
    console.warn("workspace permission normalization skipped", {
      command,
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * The runner service creates/restores workspace files, while the interactive
 * terminal writes files as the sandbox user. Normalize permissions after
 * runner writes so ordinary learner commands can overwrite/copy/move files.
 */
export async function ensureWorkspaceWritableForShellUser(workspaceDir: string) {
  const uid = String(process.env.RUNNER_WORKSPACE_UID ?? env.execUid);
  const gid = String(process.env.RUNNER_WORKSPACE_GID ?? env.execGid);

  const ownershipNormalized = await runBestEffort("chown", ["-R", `${uid}:${gid}`, workspaceDir]);
  if (!ownershipNormalized) {
    // Host-side UID can differ from container UID under rootless Docker and
    // user namespaces. This is diagnostic only: do not change container
    // privileges or silently treat a mode-666 file as user-owned.
    const st = await fs.stat(workspaceDir);
    console.warn("workspace ownership normalization failed", {
      expectedContainerUid: uid,
      expectedContainerGid: gid,
      hostWorkspaceUid: st.uid,
      hostWorkspaceGid: st.gid,
      guidance: "Check host/container UID mapping and bind-mounted file ownership before relying on chmod inside the sandbox.",
    });
  }

  /**
   * Keep group/other write as well because Docker Desktop/rootless bind mounts
   * may not preserve host/container ownership exactly. The container is already
   * isolated with no network, read-only rootfs, dropped caps, pids/mem/cpu
   * limits, and per-session workspace directories.
   */
  await runBestEffort("chmod", ["-R", "a+rwX", workspaceDir]);
}
