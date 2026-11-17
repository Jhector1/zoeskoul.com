/** Phase 2C2: opt-in DEV-ONLY proxy lifecycle. No production egress approval.
 * An image digest/label is not an egress firewall or proof of proxy safety.
 * A separately enforced deny policy is required before production use. */
import type Docker from "dockerode";
import { docker } from "../docker/dockerClient.js";
import { AdminGrantError } from "./learningAdminGrant.js";
import { adminSessionNetworkName } from "./adminSessionNetwork.js";

const PREFIX = "zoeskoul-admin-egress-";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NAME = new RegExp(`^${PREFIX}sess_${UUID}$`);
const LABEL = "com.zoeskoul.learning.admin-egress";
const LABEL_VALUE = "v1";
export const PROXY_ALIAS = "zoe-egress-proxy";
export const PROXY_PORT = 3128;

/** The admin image runs a root-owned entrypoint before `su - sandbox`.
 * Bootstrap only constant, Runner-controlled proxy settings into this lab's
 * private writable overlay, so `su -` and `sudo -i` retain proxy access.
 * No host files are mounted or modified. Direct network routing stays denied. */
export function adminEgressShellCommand(): string[] {
  const uri = `http://${PROXY_ALIAS}:${PROXY_PORT}`;
  const envExports = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]
    .map(key => `export ${key}=${uri}`);
  const apt = ["http", "https"].map(scheme =>
    `Acquire::${scheme}::Proxy \"${uri}\";`);
  const command = [
    "umask 022",
    `printf '%s\\n' ${envExports.map(v => `'${v}'`).join(" ")} > /etc/profile.d/99-zoe-egress.sh`,
    `printf '%s\\n' ${apt.map(v => `'${v}'`).join(" ")} > /etc/apt/apt.conf.d/99-zoe-egress`,
    "exec su - sandbox",
  ].join(" && ");
  return ["/bin/sh", "-c", command];
}

export function adminEgressProxyName(sessionId: string): string {
  const name = `${PREFIX}${sessionId}`;
  if (!NAME.test(name)) throw new Error("Invalid admin egress proxy session identity.");
  return name;
}

export function adminEgressProxyLabels(sessionId: string): Record<string,string> {
  adminEgressProxyName(sessionId);
  return {
    [LABEL]: LABEL_VALUE,
    "com.zoeskoul.runner": "true", // Reclaimed by existing startup container reaper.
    "com.zoeskoul.runner.session": sessionId,
    "com.zoeskoul.runner.purpose": "learn",
    "com.zoeskoul.runner.lab-mode": "admin-egress-sidecar",
  };
}

export function adminEgressConfig(configuration: NodeJS.ProcessEnv = process.env):
  { image: string } | null {
  const policy = configuration.ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY;
  if (policy !== "per-session-controlled-egress") return null;
  if (configuration.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK !== "false" ||
      configuration.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE !== "development" ||
      configuration.ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK !== "PROXY_LIFECYCLE_TEST_ONLY") {
    throw new AdminGrantError(503, "Controlled egress is restricted to supervised development.");
  }
  const image = configuration.ZOESKOUL_LEARNING_ADMIN_EGRESS_PROXY_IMAGE ?? "";
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) {
    throw new AdminGrantError(503, "A verified local proxy image ID is required.");
  }
  return {image};
}

type ProxyInspect = {
  Name?: string;
  Image?: string;
  Config?: {Labels?: Record<string,string> | null; User?: string};
  HostConfig?: {NetworkMode?: string; Privileged?: boolean; ReadonlyRootfs?: boolean;
    CapDrop?: string[]; SecurityOpt?: string[]; Memory?: number; MemorySwap?: number; PidsLimit?: number};
  State?: {Running?: boolean; Health?: {Status?: string}};
  NetworkSettings?: { Networks?: Record<string,unknown> | null };
};

export function verifyAdminEgressProxyInspect(
  info: ProxyInspect, sessionId: string, image?: string,
): void {
  const expectedName = `/${adminEgressProxyName(sessionId)}`;
  const labels = adminEgressProxyLabels(sessionId);
  if (info.Name !== expectedName ||
      Object.entries(labels).some(([key,value]) => info.Config?.Labels?.[key] !== value) ||
      info.Config?.User !== "1000:1000" ||
      info.HostConfig?.Privileged !== false ||
      info.HostConfig?.ReadonlyRootfs !== true ||
      info.HostConfig?.CapDrop?.join(",") !== "ALL" ||
      !info.HostConfig?.SecurityOpt?.some(opt => opt.startsWith("no-new-privileges")) ||
      info.HostConfig?.Memory !== 64 * 1024 * 1024 ||
      info.HostConfig?.MemorySwap !== 64 * 1024 * 1024 ||
      info.HostConfig?.PidsLimit !== 32 ||
      info.HostConfig?.NetworkMode !== "bridge" ||
      (image && info.Image !== image)) {
    throw new Error("Unverified administrator proxy identity or container security profile.");
  }
}

/** Image ID must match exactly and image must advertise the gateway contract.
 * This does NOT attest upstream destination controls. */
export async function verifyAdminEgressImage(image: string, client: Docker = docker) {
  const metadata = await client.getImage(image).inspect();
  if (metadata.Id !== image ||
      metadata.Config?.Labels?.["com.zoeskoul.learning.egress-proxy"] !== "v1" ||
      metadata.Config?.User !== "1000:1000") {
    throw new Error("Untrusted or incompatible administrator egress proxy image.");
  }
}

/** Start a dedicated, nonprivileged sidecar, then connect it to exactly one
 * session network. It stays dual-homed; ONLY permitted in supervised DEV. */
export async function createAdminEgressProxy(
  sessionId: string, networkName: string, image: string, client: Docker = docker,
): Promise<string> {
  if (networkName !== adminSessionNetworkName(sessionId)) throw new Error("Wrong proxy network owner.");
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error("Unpinned proxy image.");
  await verifyAdminEgressImage(image, client);
  const name = adminEgressProxyName(sessionId);
  const container = await client.createContainer({
    name,
    Image: image,
    User: "1000:1000",
    Labels: adminEgressProxyLabels(sessionId),
    WorkingDir: "/",
    Env: ["HOME=/tmp", "TMPDIR=/tmp"],
    HostConfig: {
      NetworkMode: "bridge",
      Privileged: false,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      ReadonlyRootfs: true,
      Memory: 64 * 1024 * 1024,
      MemorySwap: 64 * 1024 * 1024,
      CpuPeriod: 100000,
      CpuQuota: 25000,
      PidsLimit: 32,
      AutoRemove: false,
      Tmpfs: {"/tmp": "rw,nodev,nosuid,size=4m,mode=1777"},
    },
  });
  try {
    await client.getNetwork(networkName).connect({
      Container: container.id,
      EndpointConfig: {Aliases: [PROXY_ALIAS]},
    });
    await container.start();
    // Require a built-in HEALTHCHECK from the pinned gateway image.
    // A running process alone is not proof of a ready proxy.
    let ready = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const inspected = await container.inspect() as ProxyInspect;
      verifyAdminEgressProxyInspect(inspected, sessionId, image);
      const networks = Object.keys(inspected.NetworkSettings?.Networks ?? {});
      if (networks.length !== 2 || !networks.includes("bridge") ||
          !networks.includes(networkName)) {
        throw new Error("Proxy has unexpected network attachments.");
      }
      if (inspected.State?.Running !== true) throw new Error("Admin proxy exited before readiness.");
      if (inspected.State.Health?.Status === "healthy") { ready = true; break; }
      if (inspected.State.Health?.Status === "unhealthy" ||
          !inspected.State.Health?.Status) throw new Error("Proxy healthcheck missing or unhealthy.");
      await new Promise<void>(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Admin egress proxy readiness timed out.");
    return name;
  } catch (error) {
    await container.remove({force:true}).catch(() => undefined);
    throw error;
  }
}

/** Delete only the verified proxy owned by this exact session; independently
 * observed 404 is the only absence case. Cleanup failures retain tombstones. */
export async function removeAdminEgressProxy(
  name: string, sessionId: string, client: Docker = docker,
): Promise<void> {
  if (name !== adminEgressProxyName(sessionId)) throw new Error("Wrong proxy owner.");
  const container = client.getContainer(name);
  try {
    const inspected = await container.inspect() as ProxyInspect;
    verifyAdminEgressProxyInspect(inspected, sessionId);
  } catch (error) {
    if ((error as {statusCode?:number})?.statusCode === 404) return;
    throw error;
  }
  try {
    await container.remove({force:true});
  } catch (error) {
    if ((error as {statusCode?:number})?.statusCode !== 404) throw error;
  }
  // Docker's successful removal response isn't proof that the resource is gone.
  for (let retry = 0; retry < 5; retry++) {
    try { await container.inspect(); }
    catch (error) {
      if ((error as {statusCode?:number})?.statusCode === 404) return;
      throw error;
    }
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Administrator proxy remains after removal.");
}
