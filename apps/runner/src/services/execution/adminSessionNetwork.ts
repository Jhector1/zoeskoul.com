import type Docker from "dockerode";
import { docker } from "../docker/dockerClient.js";

/** A Docker network is owned by exactly one disposable administrator session.
 * The configured executor is the dedicated rootless Learning Docker daemon. */
const PREFIX = "zoeskoul-admin-net-";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NAME = new RegExp(`^${PREFIX}sess_${UUID}$`);
const LABEL = "com.zoeskoul.learning.admin-network";
const LABEL_VALUE = "v1";

export function adminSessionNetworkName(sessionId: string): string {
  const name = `${PREFIX}${sessionId}`;
  if (!NAME.test(name)) throw new Error("Invalid administrator network session identity.");
  return name;
}

export function adminSessionNetworkLabels(sessionId: string): Record<string, string> {
  adminSessionNetworkName(sessionId);
  return {
    [LABEL]: LABEL_VALUE,
    "com.zoeskoul.runner.session": sessionId,
    "com.zoeskoul.runner.purpose": "learn",
  };
}

type Inspect = {
  Name?: string;
  Driver?: string;
  Internal?: boolean;
  EnableIPv6?: boolean;
  Attachable?: boolean;
  Ingress?: boolean;
  Labels?: Record<string, string> | null;
  Containers?: Record<string, unknown> | null;
};

export function verifyAdminSessionNetworkInspect(info: Inspect, sessionId: string): void {
  if (info.Name !== adminSessionNetworkName(sessionId) ||
      info.Driver !== "bridge" || info.Internal !== true ||
      info.EnableIPv6 !== false || info.Attachable === true || info.Ingress === true ||
      info.Labels?.[LABEL] !== LABEL_VALUE ||
      info.Labels?.["com.zoeskoul.runner.session"] !== sessionId ||
      info.Labels?.["com.zoeskoul.runner.purpose"] !== "learn") {
    throw new Error("Unverified disposable administrator network.");
  }
}

export async function createAdminSessionNetwork(
  sessionId: string, client: Docker = docker,
): Promise<string> {
  const name = adminSessionNetworkName(sessionId);
  await client.createNetwork({
    Name: name,
    Driver: "bridge",
    Internal: true,
    EnableIPv6: false,
    Attachable: false,
    CheckDuplicate: true,
    Labels: adminSessionNetworkLabels(sessionId),
  });
  const inspected = await client.getNetwork(name).inspect();
  verifyAdminSessionNetworkInspect(inspected, sessionId);
  if (Object.keys(inspected.Containers ?? {}).length) {
    throw new Error("New administrator network has unexpected endpoints.");
  }
  return name;
}

/** Owner-validated, idempotent only for an independently observed 404. */
export async function removeAdminSessionNetwork(
  name: string, sessionId: string, client: Docker = docker,
): Promise<void> {
  if (name !== adminSessionNetworkName(sessionId)) {
    throw new Error("Incorrect administrator network owner.");
  }
  const network = client.getNetwork(name);
  let inspected: Inspect;
  try {
    inspected = await network.inspect();
  } catch (error) {
    if ((error as {statusCode?: number})?.statusCode === 404) return;
    throw error;
  }
  verifyAdminSessionNetworkInspect(inspected, sessionId);
  if (Object.keys(inspected.Containers ?? {}).length) {
    throw new Error("Administrator network still has attached containers.");
  }
  try {
    await network.remove();
  } catch (error) {
    if ((error as {statusCode?: number})?.statusCode !== 404) throw error;
  }
}

/** Runs only AFTER the startup container reaper and fails startup closed on
 * unverified/dangling network resources. */
export async function cleanupOrphanedAdminSessionNetworks(
  client: Docker = docker,
): Promise<void> {
  const opts = { filters: { label: [`${LABEL}=${LABEL_VALUE}`] } };
  const networks = await client.listNetworks(opts);
  for (const item of networks) {
    const name = item.Name;
    if (!name || !NAME.test(name)) {
      throw new Error("Unexpected labeled administrator network prevents startup.");
    }
    const sessionId = name.slice(PREFIX.length);
    await removeAdminSessionNetwork(name, sessionId, client);
  }
  if ((await client.listNetworks(opts)).length) {
    throw new Error("Runner startup administrator network cleanup incomplete.");
  }
}
