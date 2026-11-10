import type Docker from "dockerode";
import { docker } from "../docker/dockerClient.js";

/** Private, memory-only workspace owned by one admin session. Never a host bind. */
const PREFIX = "zoeskoul-admin-ws-";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NAME_PATTERN = new RegExp(`^${PREFIX}sess_${UUID}$`);
const LABEL = "com.zoeskoul.learning.admin-workspace";
const LABEL_VALUE = "v1";
const OPTIONS = { type: "tmpfs", device: "tmpfs", o: "size=16m,mode=1777" };

export function adminWorkspaceVolumeName(sessionId: string): string {
  const name = `${PREFIX}${sessionId}`;
  if (!NAME_PATTERN.test(name)) throw new Error("Invalid administrator session identity.");
  return name;
}

export function adminVolumeLabels(sessionId: string): Record<string, string> {
  return {
    [LABEL]: LABEL_VALUE,
    "com.zoeskoul.runner.session": sessionId,
    "com.zoeskoul.runner.purpose": "learn",
  };
}

export function validateAdminVolumeInspect(
  info: {Name?: string; Driver?: string; Options?: Record<string, string> | null; Labels?: Record<string, string> | null},
  sessionId: string,
): void {
  if (info.Name !== adminWorkspaceVolumeName(sessionId) || info.Driver !== "local" ||
      info.Options?.type !== OPTIONS.type || info.Options?.device !== OPTIONS.device ||
      info.Options?.o !== OPTIONS.o ||
      info.Labels?.[LABEL] !== LABEL_VALUE ||
      info.Labels?.["com.zoeskoul.runner.session"] !== sessionId ||
      info.Labels?.["com.zoeskoul.runner.purpose"] !== "learn") {
    throw new Error("Administrator workspace is not a verified memory-only volume.");
  }
}

export async function createAdminWorkspaceVolume(sessionId: string): Promise<string> {
  const name = adminWorkspaceVolumeName(sessionId);
  // No fallback to disk-backed Docker volumes if tmpfs is unsupported.
  await docker.createVolume({
    Name: name,
    Driver: "local",
    DriverOpts: { ...OPTIONS },
    Labels: adminVolumeLabels(sessionId),
  });
  await verifyAdminWorkspaceVolume(name, sessionId);
  return name;
}

export async function verifyAdminWorkspaceVolume(name: string, sessionId: string): Promise<void> {
  if (name !== adminWorkspaceVolumeName(sessionId)) throw new Error("Incorrect administrator workspace owner.");
  const info = await docker.getVolume(name).inspect();
  validateAdminVolumeInspect(info, sessionId);
}

export async function removeAdminWorkspaceVolume(name: string, sessionId: string): Promise<void> {
  // Idempotent after an independently confirmed 404: there is nothing left
  // to reclaim. Never delete an existing volume without validating its owner.
  if (name !== adminWorkspaceVolumeName(sessionId)) throw new Error("Incorrect administrator workspace owner.");
  const volume = docker.getVolume(name);
  try {
    const info = await volume.inspect();
    validateAdminVolumeInspect(info, sessionId);
  } catch (error) {
    if ((error as {statusCode?: number})?.statusCode === 404) return;
    throw error;
  }
  try {
    await volume.remove();
  } catch (error) {
    if ((error as {statusCode?: number})?.statusCode !== 404) throw error;
  }
}

/** Startup-only recovery, after Docker's existing container reaper. */
export async function cleanupOrphanedAdminWorkspaceVolumes(client: Docker = docker): Promise<void> {
  const opts = { filters: { label: [`${LABEL}=${LABEL_VALUE}`] } };
  const result = await client.listVolumes(opts);
  const candidates = result.Volumes ?? [];
  for (const item of candidates) {
    const name = item.Name;
    if (!name || !NAME_PATTERN.test(name)) {
      throw new Error("Unexpected labeled administrator volume prevents startup.");
    }
    const sessionId = name.slice(PREFIX.length);
    validateAdminVolumeInspect(item, sessionId);
    await client.getVolume(name).remove();
  }
  const after = await client.listVolumes(opts);
  if ((after.Volumes ?? []).length) {
    throw new Error("Runner startup administrator volume cleanup incomplete.");
  }
}
