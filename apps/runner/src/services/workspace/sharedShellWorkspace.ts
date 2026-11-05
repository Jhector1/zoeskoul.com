import fs from "node:fs/promises";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { getSessionsForWorkspaceDir } from "../sessions/sessionStore.js";
import { createWorkspace } from "./createWorkspace.js";

type SharedWorkspaceRecord = {
  key: string;
  workspaceDir: string;
  pendingReservations: number;
};

export type SharedShellWorkspaceReservation = {
  key: string;
  workspaceDir: string;
};

const recordsByKey = new Map<string, SharedWorkspaceRecord>();
const keyByWorkspaceDir = new Map<string, string>();
const creationPromises = new Map<string, Promise<SharedWorkspaceRecord>>();

function sharedKey(ownerKey: string, workspaceKey: string) {
  return `${ownerKey}\0${workspaceKey}`;
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRecord(args: {
  ownerKey: string;
  workspaceKey: string;
  files: WorkspaceSyncEntry[];
}) {
  const key = sharedKey(args.ownerKey, args.workspaceKey);
  const existing = recordsByKey.get(key);

  if (existing && (await pathExists(existing.workspaceDir)) &&
      recordsByKey.get(key) === existing) {
    return existing;
  }

  if (existing && recordsByKey.get(key) === existing) {
    recordsByKey.delete(key);
    keyByWorkspaceDir.delete(existing.workspaceDir);
  }

  const inFlight = creationPromises.get(key);
  if (inFlight) return await inFlight;

  const creation = (async () => {
    const workspaceDir = await createWorkspace(args.files);
    const record: SharedWorkspaceRecord = {
      key,
      workspaceDir,
      pendingReservations: 0,
    };
    recordsByKey.set(key, record);
    keyByWorkspaceDir.set(workspaceDir, key);
    return record;
  })();

  creationPromises.set(key, creation);

  try {
    return await creation;
  } finally {
    creationPromises.delete(key);
  }
}

export async function acquireSharedShellWorkspace(args: {
  ownerKey: string;
  workspaceKey: string;
  files: WorkspaceSyncEntry[];
}): Promise<SharedShellWorkspaceReservation> {
  // A retired workspace must never be handed to a new session while its
  // final owner is removing the directory. Revalidate after each await.
  for (;;) {
    const record = await resolveRecord(args);
    if (recordsByKey.get(record.key) !== record) continue;
    record.pendingReservations += 1;
    return { key: record.key, workspaceDir: record.workspaceDir };
  }
}

export async function releaseSharedShellWorkspaceReservation(args: {
  reservation: SharedShellWorkspaceReservation;
  keepWorkspace: boolean;
}) {
  const record = recordsByKey.get(args.reservation.key);
  if (!record) return;

  record.pendingReservations = Math.max(0, record.pendingReservations - 1);

  if (
    !args.keepWorkspace &&
    record.pendingReservations === 0 &&
    getSessionsForWorkspaceDir(record.workspaceDir).length === 0
  ) {
    recordsByKey.delete(record.key);
    keyByWorkspaceDir.delete(record.workspaceDir);
    await fs.rm(record.workspaceDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Atomically detach an unreserved shared workspace before final deletion.
 * Subsequent acquisitions allocate another directory rather than reusing
 * a workspace being removed. Pending starts keep the old workspace alive.
 */
export function retireSharedShellWorkspaceForCleanup(workspaceDir: string): boolean {
  const key = keyByWorkspaceDir.get(workspaceDir);
  if (!key) return true;
  const record = recordsByKey.get(key);
  if (!record || record.workspaceDir !== workspaceDir) {
    keyByWorkspaceDir.delete(workspaceDir);
    return true;
  }
  if (record.pendingReservations > 0) return false;
  forgetSharedShellWorkspace(workspaceDir);
  return true;
}

export function forgetSharedShellWorkspace(workspaceDir: string) {
  const key = keyByWorkspaceDir.get(workspaceDir);
  if (!key) return;

  keyByWorkspaceDir.delete(workspaceDir);
  recordsByKey.delete(key);
}

export function __resetSharedShellWorkspacesForTests() {
  recordsByKey.clear();
  keyByWorkspaceDir.clear();
  creationPromises.clear();
}
