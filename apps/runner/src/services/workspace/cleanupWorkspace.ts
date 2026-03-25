import fs from "node:fs/promises";

export async function cleanupWorkspace(workspaceDir: string) {
    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
}