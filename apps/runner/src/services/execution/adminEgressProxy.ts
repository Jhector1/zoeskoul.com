/** Phase 2C2: opt-in DEV-ONLY proxy lifecycle. No production egress approval.
 * An image digest/label is not an egress firewall or proof of proxy safety.
 * A separately enforced deny policy is required before production use. */
import type Docker from "dockerode";
import { docker } from "../docker/dockerClient.js";
import { AdminGrantError } from "./learningAdminGrant.js";
import { adminSessionNetworkName, verifyAdminSessionNetworkInspect } from "./adminSessionNetwork.js";

const PREFIX = "zoeskoul-admin-egress-";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NAME = new RegExp(`^${PREFIX}sess_${UUID}$`);
const LABEL = "com.zoeskoul.learning.admin-egress";
const LABEL_VALUE = "v1";
const GATEWAY_PHASE = "2c3-development-audit-only";
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
  Config?: {Labels?: Record<string,string> | null; User?: string; Env?: string[] | null};
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
      metadata.Config?.Labels?.["com.zoeskoul.learning.egress-gateway-phase"] !== GATEWAY_PHASE ||
      metadata.Config?.User !== "1000:1000") {
    throw new Error("Untrusted or incompatible administrator egress proxy image.");
  }
}

/** Only accept one canonical IPv4 IPAM subnet; never infer it from a name,
 * a default allocation, a client request or a container environment. */
type NetworkIPAM = { IPAM?: { Config?: Array<{ Subnet?: string }> | null } | null };
function ipv4Subnet(info: NetworkIPAM): { cidr: string; first: number; last: number; prefix: number } {
  const configs = info.IPAM?.Config;
  const cidr = configs?.[0]?.Subnet;
  if (!Array.isArray(configs) || configs.length !== 1 || typeof cidr !== "string") {
    throw new Error("Expected exactly one IPv4 IPAM subnet.");
  }
  const match = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\/(0|[1-9]\d?)$/.exec(cidr);
  if (!match || match[0] !== cidr) throw new Error("Invalid canonical IPv4 subnet.");
  const octets = match.slice(1,5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some(n => n > 255) || prefix > 32) throw new Error("Invalid IPv4 subnet.");
  const first = octets.reduce((n, octet) => n * 256 + octet, 0);
  const size = 2 ** (32-prefix);
  if (first % size !== 0) throw new Error("Noncanonical IPv4 subnet.");
  return {cidr, first, last:first+size-1, prefix};
}

export async function verifiedAdminGatewayCIDR(
  sessionId: string, networkName: string, client: Docker = docker,
): Promise<string> {
  if (networkName !== adminSessionNetworkName(sessionId)) throw new Error("Wrong proxy network owner.");
  const lab = await client.getNetwork(networkName).inspect();
  verifyAdminSessionNetworkInspect(lab, sessionId);
  if (Object.keys(lab.Containers ?? {}).length !== 0) throw new Error("Gateway requires an empty session network.");
  const subnet = ipv4Subnet(lab);
  // Match the Go gateway's RFC1918, /16 through /28 contract exactly.
  const privateRanges = [[167772160,184549375],[2886729728,2887778303],[3232235520,3232301055]];
  if (subnet.prefix < 16 || subnet.prefix > 28 ||
      !privateRanges.some(([start,end]) => subnet.first >= start && subnet.last <= end)) {
    throw new Error("Gateway requires a private IPv4 /16 through /28 subnet.");
  }
  const bridge = await client.getNetwork("bridge").inspect();
  if (bridge.Name !== "bridge" || bridge.Driver !== "bridge" || bridge.Internal !== false || bridge.EnableIPv6 !== false) {
    throw new Error("Unverified development outbound bridge.");
  }
  const outbound = ipv4Subnet(bridge);
  if (subnet.first <= outbound.last && outbound.first <= subnet.last) {
    throw new Error("Session subnet overlaps outbound bridge.");
  }
  return subnet.cidr;
}

/** Start a dedicated, nonprivileged sidecar, then connect it to exactly one
 * session network. It stays dual-homed; ONLY permitted in supervised DEV. */
export async function createAdminEgressProxy(
  sessionId: string, networkName: string, image: string, client: Docker = docker,
): Promise<string> {
  if (networkName !== adminSessionNetworkName(sessionId)) throw new Error("Wrong proxy network owner.");
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error("Unpinned proxy image.");
  await verifyAdminEgressImage(image, client);
  const cidr = await verifiedAdminGatewayCIDR(sessionId, networkName, client);
  const name = adminEgressProxyName(sessionId);
  const container = await client.createContainer({
    name,
    Image: image,
    User: "1000:1000",
    Labels: adminEgressProxyLabels(sessionId),
    WorkingDir: "/",
    Env: ["HOME=/tmp", "TMPDIR=/tmp", `LAB_CLIENT_CIDR=${cidr}`],
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
    for (let attempt = 0; attempt < 30; attempt++) {
      const inspected = await container.inspect() as ProxyInspect;
      verifyAdminEgressProxyInspect(inspected, sessionId, image);
      const cidrEnv = (inspected.Config?.Env ?? []).filter(v => v.startsWith("LAB_CLIENT_CIDR="));
      if (cidrEnv.length !== 1 || cidrEnv[0] !== `LAB_CLIENT_CIDR=${cidr}`) {
        throw new Error("Gateway CIDR environment mismatch.");
      }
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
