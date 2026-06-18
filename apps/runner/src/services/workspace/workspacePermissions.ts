import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../../lib/env.js";

const execFileAsync = promisify(execFile);

async function runBestEffort(command: string, args: string[]) {
  try {
    await execFileAsync(command, args);
  } catch (err) {
    console.warn("workspace permission normalization skipped", {
      command,
      message: err instanceof Error ? err.message : String(err),
    });
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

  await runBestEffort("chown", ["-R", `${uid}:${gid}`, workspaceDir]);

  /**
   * Keep group/other write as well because Docker Desktop/rootless bind mounts
   * may not preserve host/container ownership exactly. The container is already
   * isolated with no network, read-only rootfs, dropped caps, pids/mem/cpu
   * limits, and per-session workspace directories.
   */
  await runBestEffort("chmod", ["-R", "a+rwX", workspaceDir]);
}
