import crypto from "node:crypto";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { resolveWorkspaceFileCapability } from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";
import { runWorkspaceFileWorker } from "./workspaceFileDockerExec.js";
import type { SessionRecord } from "../sessions/sessionStore.js";
import { formatWorkspaceSnapshotEntries } from "./snapshotWorkspaceFiles.js";
import {
  IGNORED_SNAPSHOT_DIRS,
  isAllowedWorkspaceFile,
  isSafeRelativePath,
} from "./workspacePolicy.js";
import {
  isRunnerManagedFilePath,
  isWorkspaceSnapshotHiddenDirPath,
} from "./runnerManagedWorkspace.js";

/**
 * Read-only fallback for the dedicated Learning pool: the existing immutable
 * V6 sandbox file worker uses the learner's exact non-root UID and Docker mount
 * namespace. No chmod/chown, host-root read, extra mount, or new Docker image.
 *
 * Only the authenticated, currently active standard shell is eligible. Caller
 * owns the workspace sync lock; worker itself rechecks the Docker container's
 * session labels, user, mount and running state on EVERY operation.
 *
 * The worker is intentionally not invoked for completed sessions, administrator
 * labs, or ZoeBuild. Fail closed when it cannot produce an entire snapshot.
 */
export class LearnerSnapshotUnavailableError extends Error {
  readonly code = "EACCES";
  constructor() {
    super("Learner workspace snapshot worker unavailable.");
  }
}

type WorkerReply = Awaited<ReturnType<typeof runWorkspaceFileWorker>>;

function fail(): never {
  throw new LearnerSnapshotUnavailableError();
}

async function worker(
  session: SessionRecord,
  request: { op: "list" | "read"; path: string; maxBytes: number },
): Promise<Extract<WorkerReply, {ok: true}>> {
  try {
    const result = await runWorkspaceFileWorker(session, request);
    if (!result.ok) fail();
    return result;
  } catch {
    fail();
  }
}

function validatedName(value: unknown): string {
  if (typeof value !== "string" || !value || value === "." || value === ".." ||
      value.includes("/") || value.includes("\\") || value.includes("\0")) fail();
  return value;
}

function validatedRelative(parent: string, name: string): string {
  const rel = parent ? `${parent}/${name}` : name;
  if (!isSafeRelativePath(rel)) fail();
  return rel;
}

function strictBase64(value: unknown): Buffer {
  if (typeof value !== "string" || value.length > (5 * 1024 * 1024 * 4 / 3 + 8) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail();
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) fail();
  return bytes;
}

export async function snapshotWorkspaceViaLearnerWorker(
  session: SessionRecord,
): Promise<WorkspaceSyncEntry[]> {
  const dirs: string[] = [];
  const files: string[] = [];
  const seen = new Set<string>();
  let enumerated = 0;
  let visibleBytes = 0;

  async function visit(parent: string, depth: number): Promise<void> {
    // The immutable worker rejects deeper paths at 32 segments.
    if (depth > 32) fail();
    const reply = await worker(session, {
      op: "list",
      path: parent,
      maxBytes: Math.min(env.maxFileBytes, 5 * 1024 * 1024),
    });
    if (!Array.isArray(reply.entries) || reply.entries.length > 256) fail();

    for (const raw of reply.entries) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail();
      const item = raw as Record<string, unknown>;
      const name = validatedName(item.name);
      const rel = validatedRelative(parent, name);
      if (seen.has(rel)) fail();
      seen.add(rel);
      if (item.kind !== "directory" && item.kind !== "file") fail();
      if (typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size < 0) fail();

      enumerated += 1;
      if (enumerated > env.maxRuntimeEntries) {
        throw new Error("Workspace entry limit reached.");
      }
      if (item.kind === "directory") {
        if (IGNORED_SNAPSHOT_DIRS.has(name) || isWorkspaceSnapshotHiddenDirPath(rel)) continue;
        dirs.push(rel);
        if (dirs.length + files.length > env.maxEntries) {
          throw new Error("Workspace snapshot entry limit reached.");
        }
        await visit(rel, depth + 1);
      } else {
        visibleBytes += item.size;
        if (visibleBytes > env.maxWorkspaceBytes) {
          throw new Error("Workspace size limit reached.");
        }
        if (isRunnerManagedFilePath(rel) || !isAllowedWorkspaceFile(rel)) continue;
        files.push(rel);
        if (files.length > env.maxFiles || dirs.length + files.length > env.maxEntries) {
          throw new Error("Workspace snapshot file limit reached.");
        }
      }
    }
  }

  await visit("", 0);

  // Reuse the canonical serializer, supported-type rules and text/binary quotas
  // instead of maintaining a second snapshot protocol in the worker.
  return formatWorkspaceSnapshotEntries(dirs, files, async (rel) => {
    const capability = resolveWorkspaceFileCapability(rel);
    if (!capability) fail();
    const limit = Math.min(
      capability.storage === "binary" ? env.maxBinaryFileBytes : env.maxFileBytes,
      5 * 1024 * 1024,
    );
    const reply = await worker(session, { op: "read", path: rel, maxBytes: limit });
    const data = strictBase64(reply.data);
    if (data.byteLength > limit) fail();
    const checksum = `sha256:${crypto.createHash("sha256").update(data).digest("hex")}`;
    if (reply.revision !== checksum) fail();
    return data;
  });
}
