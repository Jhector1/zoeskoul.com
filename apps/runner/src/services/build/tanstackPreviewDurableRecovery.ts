import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { removeRunnerWorkspaceWithRecovery } from "../docker/runnerWorkspaceReclamation.js";

/** Private, resource-only crash journal. Never persist owner tokens, source,
 * checkout details or preview capabilities. The journal is NOT an authority
 * for deleting arbitrary paths: the startup reaper separately discovers only
 * runner-labeled Docker containers and workspace-root children. */
const JOURNAL_DIR = ".zoebuild-tanstack-recovery-v1";
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKSPACE_NAME = /^zoeskoul-run-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const DOCKER_ID = /^[a-f0-9]{12,64}$/i;

export type DurableTanstackResource = Readonly<{
  version: 1;
  runId: string;
  workspaceDir: string | null;
  containerId: string | null;
  updatedAt: number;
}>;

function safeWorkspace(workspaceRoot: string, candidate: string | null) {
  if (candidate === null) return;
  if (typeof candidate !== "string" ||
      path.dirname(path.resolve(candidate)) !== path.resolve(workspaceRoot) ||
      !WORKSPACE_NAME.test(path.basename(candidate))) {
    throw new Error("Invalid TanStack recovery workspace identity.");
  }
}

function validate(workspaceRoot: string, record: DurableTanstackResource) {
  if (record.version !== 1 || !RUN_ID.test(record.runId) ||
      !Number.isSafeInteger(record.updatedAt) || record.updatedAt < 1 ||
      (record.containerId !== null && !DOCKER_ID.test(record.containerId))) {
    throw new Error("Invalid TanStack recovery journal record.");
  }
  safeWorkspace(workspaceRoot, record.workspaceDir);
}

async function privateRoot(workspaceRoot: string, create: boolean) {
  const root = path.join(workspaceRoot, JOURNAL_DIR);
  if (create) await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(root).catch((error: NodeJS.ErrnoException) => {
    if (!create && error.code === "ENOENT") return null;
    throw error;
  });
  if (!stat) return null;
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Unsafe TanStack recovery journal directory.");
  if (create) await fs.chmod(root, 0o700);
  return root;
}

async function syncDirectory(root: string) {
  // Directory fsync is supported by the Linux executor; do not claim durable
  // rename on filesystems that refuse it.
  const handle = await fs.open(root, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

export function createTanstackRecoveryJournal(workspaceRoot: string) {
  const runId = randomUUID();
  let record: DurableTanstackResource = {
    version: 1, runId, workspaceDir: null, containerId: null, updatedAt: Date.now(),
  };
  const fileName = `${runId}.json`;
  return {
    runId,
    get current() { return record; },
    async write(update: Partial<Pick<DurableTanstackResource,"workspaceDir" | "containerId">> = {}) {
      const next: DurableTanstackResource = { ...record, ...update, updatedAt: Date.now() };
      validate(workspaceRoot, next);
      const root = await privateRoot(workspaceRoot, true);
      if (!root) throw new Error("Recovery journal directory missing.");
      const target = path.join(root, fileName);
      const tmp = path.join(root, `${fileName}.tmp-${randomUUID()}`);
      try {
        const handle = await fs.open(tmp, "wx", 0o600);
        try { await handle.writeFile(JSON.stringify(next)); await handle.sync(); }
        finally { await handle.close(); }
        await fs.rename(tmp, target);
        await syncDirectory(root);
        record = next;
      } finally {
        await fs.rm(tmp, { force: true }).catch(() => {});
      }
    },
    async clear() {
      if (record.workspaceDir || record.containerId)
        throw new Error("Cannot discard live TanStack recovery identity.");
      const root = await privateRoot(workspaceRoot, false);
      if (!root) return;
      await fs.rm(path.join(root, fileName), { force: true });
      await syncDirectory(root);
    },
  };
}

/** Called only AFTER the startup Docker and workspace reapers succeed. We
 * validate the audit records but never trust their contents as deletion paths.
 * Any corrupt record prevents Runner from accepting new workloads. */
export async function clearReconciledTanstackJournals(workspaceRoot: string) {
  const root = await privateRoot(workspaceRoot, false);
  if (!root) return 0;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const match = /^([0-9a-f-]{36})\.json(?:\.tmp-[0-9a-f-]{36})?$/i.exec(entry.name);
    if (!match || !RUN_ID.test(match[1]) || !entry.isFile() || entry.isSymbolicLink())
      throw new Error("Unsafe TanStack recovery journal entry.");
    if (!entry.name.includes(".tmp-")) {
      const parsed: unknown = JSON.parse(await fs.readFile(path.join(root, entry.name), "utf8"));
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid TanStack journal.");
      const value = parsed as DurableTanstackResource;
      validate(workspaceRoot, value);
      if (value.runId !== match[1]) throw new Error("TanStack journal identity mismatch.");
    }
  }
  for (const entry of entries) await fs.unlink(path.join(root, entry.name));
  if (entries.length) await syncDirectory(root);
  return entries.length;
}

/** Fail-closed full-stack preview cleanup. Reuse the validated rootless
 * workspace reclamation helper while independently proving deletion before
 * the recovery journal or preview capacity lease may be released. */
export async function removeTanstackWorkspaceStrict(workspaceRoot: string, workspaceDir: string) {
  safeWorkspace(workspaceRoot, workspaceDir);
  const stat = await fs.lstat(workspaceDir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!stat) return;
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Unsafe TanStack preview workspace.");
  await removeRunnerWorkspaceWithRecovery(workspaceDir);
  const remaining = await fs.lstat(workspaceDir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (remaining) throw new Error("TanStack preview workspace cleanup unverified.");
}
