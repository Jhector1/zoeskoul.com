/** Supervised DEV ONLY. Require a fresh, separately filtered namespace before gateway startup. */
import type Docker from "dockerode";
import { docker } from "../docker/dockerClient.js";
import { AdminGrantError } from "./learningAdminGrant.js";
import { adminSessionNetworkName, verifyAdminSessionNetworkInspect } from "./adminSessionNetwork.js";

const PREFIX = "zoeskoul-admin-egress-";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NAME = new RegExp(`^${PREFIX}sess_${UUID}$`);
const LABEL = "com.zoeskoul.learning.admin-egress";
const LABEL_VALUE = "v1";
const FIREWALL_PHASE = "protected-lifecycle-dev-v1";
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

const HOSTS = ["archive.ubuntu.com", "security.ubuntu.com", "example.com"] as const;
type PinManifest = { expiresAt: number; hosts: Record<string,string[]> };
type ProtectedConfig = { image: string; firewallImage: string; pins: PinManifest };
const imageID = /^sha256:[a-f0-9]{64}$/;
function ipv4Value(ip: string): number {
  if (!/^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$/.test(ip)) throw new Error("Invalid IPv4 pin.");
  const bytes = ip.split(".").map(Number);
  if (bytes.some(v => v > 255)) throw new Error("Invalid IPv4 pin.");
  return bytes.reduce((n,b) => n*256+b,0);
}
function publicPin(ip: string): boolean {
  const value = ipv4Value(ip);
  return !["0.0.0.0/8","10.0.0.0/8","100.64.0.0/10","127.0.0.0/8","169.254.0.0/16","172.16.0.0/12","192.0.0.0/24","192.0.2.0/24","192.88.99.0/24","192.168.0.0/16","198.18.0.0/15","198.51.100.0/24","203.0.113.0/24","224.0.0.0/3"].some(c => {
    const [a,p] = c.split("/"); const first=ipv4Value(a); return value>=first && value<first+2**(32-Number(p));
  });
}
export function parseAdminEgressPins(raw: string, now = Math.floor(Date.now()/1000)): PinManifest {
  if (raw.length > 8192) throw new Error("Oversized egress pins.");
  const pins = JSON.parse(raw) as PinManifest;
  if (!pins || Object.keys(pins).sort().join(",") !== "expiresAt,hosts" || !Number.isSafeInteger(pins.expiresAt) || pins.expiresAt-now<60 || pins.expiresAt-now>3600 || !pins.hosts || Object.keys(pins.hosts).sort().join(",") !== [...HOSTS].sort().join(",")) throw new Error("Invalid or expired egress pins.");
  for (const host of HOSTS) {
    const entries=pins.hosts[host];
    if (!Array.isArray(entries) || entries.length<1 || entries.length>32 || new Set(entries).size!==entries.length || entries.some(ip=>typeof ip!=="string" || !publicPin(ip))) throw new Error("Unsafe egress pins.");
  }
  return pins;
}
export function adminEgressConfig(configuration: NodeJS.ProcessEnv = process.env): ProtectedConfig | null {
  if (configuration.ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY !== "per-session-controlled-egress") return null;
  if (configuration.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK !== "false" || configuration.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE !== "development" || configuration.ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK !== "PROTECTED_LIFECYCLE_TEST_ONLY") throw new AdminGrantError(503, "Controlled egress requires the protected supervised development lifecycle.");
  const image=configuration.ZOESKOUL_LEARNING_ADMIN_EGRESS_PROXY_IMAGE ?? "";
  const firewallImage=configuration.ZOESKOUL_LEARNING_ADMIN_EGRESS_FIREWALL_IMAGE ?? "";
  if (!imageID.test(image) || !imageID.test(firewallImage) || image===firewallImage) throw new AdminGrantError(503,"Verified local gateway and firewall image IDs required.");
  try { return {image,firewallImage,pins:parseAdminEgressPins(configuration.ZOESKOUL_LEARNING_ADMIN_EGRESS_PINS_JSON ?? "")}; }
  catch { throw new AdminGrantError(503,"Fresh approved egress pins required."); }
}

type ProxyInspect = {
  Name?: string;
  Image?: string;
  Config?: {Labels?: Record<string,string> | null; User?: string; Env?: string[] | null};
  HostConfig?: {NetworkMode?: string; Privileged?: boolean; ReadonlyRootfs?: boolean;
    CapDrop?: string[]; CapAdd?: string[] | null; SecurityOpt?: string[]; Memory?: number; MemorySwap?: number; PidsLimit?: number};
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
      !/^container:[a-f0-9]{64}$/.test(info.HostConfig?.NetworkMode ?? "") ||
      (info.HostConfig?.CapAdd?.length ?? 0) !== 0 ||
      (image && info.Image !== image)) {
    throw new Error("Unverified administrator proxy identity or container security profile.");
  }
}

/** Dockerode's inspect typings allow strings, but our pinned images use
 * exactly one exec-form argument. Reject shell-form and multi-item values. */
function exactSingleArg(value: unknown, expected: string): boolean {
  return Array.isArray(value) && value.length === 1 && value[0] === expected;
}

/** Image ID must match exactly and image must advertise the gateway contract.
 * This does NOT attest upstream destination controls. */
export async function verifyAdminEgressImage(image: string, client: Docker = docker) {
  const metadata = await client.getImage(image).inspect();
  if (metadata.Id !== image ||
      metadata.Config?.Labels?.["com.zoeskoul.learning.egress-proxy"] !== "v1" ||
      metadata.Config?.Labels?.["com.zoeskoul.learning.egress-gateway-phase"] !== GATEWAY_PHASE ||
      metadata.Config?.User !== "1000:1000" || !exactSingleArg(metadata.Config?.Entrypoint, "/gateway") || Object.keys(metadata.Config?.Volumes ?? {}).length) {
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

type Role = "holder" | "firewall";
function componentName(sessionId:string,role:Role) { return `${adminEgressProxyName(sessionId)}-${role}`; }
function componentLabels(sessionId:string,role:Role) {
  return {...adminEgressProxyLabels(sessionId),"com.zoeskoul.runner.lab-mode":`admin-egress-${role}`};
}
const safeHost = {Privileged:false,CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],ReadonlyRootfs:true,Memory:64*1024*1024,MemorySwap:64*1024*1024,CpuPeriod:100000,CpuQuota:25000,PidsLimit:32,AutoRemove:false,RestartPolicy:{Name:"no"}};
async function deadline<T>(promise:Promise<T>,ms:number):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try { return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Administrator egress operation timed out.")),ms);})]); }
  finally { if(timer)clearTimeout(timer); }
}
async function namespace(container:Docker.Container):Promise<string> {
  const exec=await container.exec({Cmd:["/usr/bin/readlink","/proc/self/ns/net"],AttachStdout:true,AttachStderr:true,Tty:true});
  const stream=await exec.start({Detach:false,Tty:true});
  let output="";
  try {
    await deadline(new Promise<void>((resolve,reject)=>{
      stream.on("data",(chunk:Buffer)=>{output+=chunk.toString();if(output.length>128)reject(new Error("Invalid namespace response."));});
      stream.once("end",resolve);stream.once("error",reject);
    }),5000);
  } finally { if (typeof (stream as any).destroy==="function") (stream as any).destroy(); }
  const status=await exec.inspect(); const match=/^net:\[([0-9]+)\]$/.exec(output.trim());
  if(status.ExitCode!==0 || !match)throw new Error("Unable to verify holder namespace.");
  return match[1];
}
async function holderIdentity(holder:Docker.Container,sessionId:string,networkName:string,cidr:string,firewallImage:string) {
  const i=await holder.inspect();
  const networks=i.NetworkSettings?.Networks ?? {};
  const h=i.HostConfig;
  const lab=networks[networkName];
  const parsed=ipv4Subnet({IPAM:{Config:[{Subnet:cidr}]}});
  const addr=ipv4Value(lab?.IPAddress ?? "");
  if (i.Id!==holder.id || !/^[a-f0-9]{64}$/.test(i.Id) || i.Name!==`/${componentName(sessionId,"holder")}` || i.Image!==firewallImage || i.Config.User!=="1000:1000" || !exactSingleArg(i.Config.Entrypoint,"/usr/bin/sleep") || !exactSingleArg(i.Config.Cmd,"infinity") || Object.entries(componentLabels(sessionId,"holder")).some(([k,v])=>i.Config.Labels?.[k]!==v) || !i.State.Running || h.NetworkMode!=="bridge" || h.Privileged!==false || h.ReadonlyRootfs!==true || h.CapDrop?.join(",")!=="ALL" || (h.CapAdd?.length??0)!==0 || !h.SecurityOpt?.includes("no-new-privileges:true") || i.Mounts?.length || Object.keys(networks).sort().join(",")!==["bridge",networkName].sort().join(",") || !lab?.Aliases?.includes(PROXY_ALIAS) || addr<=parsed.first || addr>=parsed.last) throw new Error("Unverified administrator namespace holder.");
  return {ip:lab.IPAddress,inode:await namespace(holder)};
}
async function verifyFirewallImage(image:string,client:Docker) {
  const i=await client.getImage(image).inspect();
  if(i.Id!==image || i.Config.User!=="0:0" || i.Config.Labels?.["com.zoeskoul.learning.firewall-initializer"]!==FIREWALL_PHASE || !exactSingleArg(i.Config.Entrypoint,"/usr/local/bin/zoe-firewall-init") || Object.keys(i.Config.Volumes??{}).length)throw new Error("Untrusted firewall initializer image.");
}
/** Protected gateway; there is no legacy unfiltered fallback. */
export async function createAdminEgressProxy(sessionId:string,networkName:string,image:string,client:Docker=docker,configuration:NodeJS.ProcessEnv=process.env):Promise<string> {
  const config=adminEgressConfig(configuration);
  if(!config || config.image!==image)throw new Error("Protected egress configuration required.");
  const name=adminEgressProxyName(sessionId);
  const daemon=await client.info();
  if (!Array.isArray(daemon.SecurityOptions) || !daemon.SecurityOptions.includes("name=rootless"))throw new Error("Protected egress requires the rootless Docker daemon.");
  await verifyAdminEgressImage(image,client);
  await verifyFirewallImage(config.firewallImage,client);
  const cidr=await verifiedAdminGatewayCIDR(sessionId,networkName,client);
  const extraHosts=HOSTS.flatMap(host=>config.pins.hosts[host].map(ip=>`${host}:${ip}`));
  // No untrusted gateway code executes until the trusted helper exits and is removed.
  try {
    const holder=await client.createContainer({name:componentName(sessionId,"holder"),Image:config.firewallImage,User:"1000:1000",Labels:componentLabels(sessionId,"holder"),Entrypoint:["/usr/bin/sleep"],Cmd:["infinity"],HostConfig:{...safeHost,NetworkMode:"bridge",ExtraHosts:extraHosts}});
    await holder.start();
    await client.getNetwork(networkName).connect({Container:holder.id,EndpointConfig:{Aliases:[PROXY_ALIAS]}});
    const identity=await holderIdentity(holder,sessionId,networkName,cidr,config.firewallImage);
    const mode=`container:${holder.id}`;
    const helper=await client.createContainer({name:componentName(sessionId,"firewall"),Image:config.firewallImage,User:"0:0",Labels:componentLabels(sessionId,"firewall"),Cmd:[identity.inode,cidr,identity.ip,JSON.stringify(config.pins.hosts),String(config.pins.expiresAt)],HostConfig:{...safeHost,NetworkMode:mode,CapAdd:["NET_ADMIN"]}});
    const hi=await helper.inspect();
    if(hi.Id!==helper.id || hi.Name!==`/${componentName(sessionId,"firewall")}` || hi.Image!==config.firewallImage || hi.Config.User!=="0:0" || !exactSingleArg(hi.Config.Entrypoint,"/usr/local/bin/zoe-firewall-init") || hi.HostConfig.NetworkMode!==mode || hi.HostConfig.Privileged!==false || hi.HostConfig.ReadonlyRootfs!==true || hi.HostConfig.CapDrop?.join(",")!=="ALL" || !["NET_ADMIN","CAP_NET_ADMIN"].includes(hi.HostConfig.CapAdd?.join(",")??"") || !hi.HostConfig.SecurityOpt?.includes("no-new-privileges:true") || hi.Mounts?.length || Object.entries(componentLabels(sessionId,"firewall")).some(([k,v])=>hi.Config.Labels?.[k]!==v))throw new Error("Unverified firewall initializer profile.");
    await helper.start();
    const result=await deadline(helper.wait(),15000);
    if(result.StatusCode!==0)throw new Error("Independent firewall installation failed.");
    await removeOwnedComponent(sessionId,"firewall",client);
    const again=await holderIdentity(holder,sessionId,networkName,cidr,config.firewallImage);
    if(again.inode!==identity.inode || again.ip!==identity.ip)throw new Error("Holder identity changed after firewall installation.");
    const container=await client.createContainer({name,Image:image,User:"1000:1000",Labels:adminEgressProxyLabels(sessionId),WorkingDir:"/",Env:[`LAB_CLIENT_CIDR=${cidr}`],HostConfig:{...safeHost,NetworkMode:mode}});
    const beforeStart=await container.inspect();
    verifyAdminEgressProxyInspect(beforeStart,sessionId,image);
    if(beforeStart.HostConfig.NetworkMode!==mode || beforeStart.Mounts?.length || !exactSingleArg(beforeStart.Config.Entrypoint,"/gateway"))throw new Error("Gateway protected namespace/profile mismatch.");
    await container.start();
    for(let attempt=0;attempt<30;attempt++){
      const i=await container.inspect(); verifyAdminEgressProxyInspect(i,sessionId,image);
      if(i.HostConfig.NetworkMode!==mode || (i.Config.Env??[]).filter(v=>v.startsWith("LAB_CLIENT_CIDR=")).join(",")!==`LAB_CLIENT_CIDR=${cidr}` || i.Mounts?.length)throw new Error("Gateway protected namespace/profile mismatch.");
      if(!i.State.Running || !i.State.Health?.Status || i.State.Health.Status==="unhealthy")throw new Error("Gateway not healthy.");
      if(i.State.Health.Status==="healthy"){
        const final=await holderIdentity(holder,sessionId,networkName,cidr,config.firewallImage);
        if(final.inode!==identity.inode || final.ip!==identity.ip || config.pins.expiresAt-Math.floor(Date.now()/1000)<10)throw new Error("Protected namespace changed or pins expired.");
        return name;
      }
      await new Promise<void>(r=>setTimeout(r,500));
    }
    throw new Error("Admin egress proxy readiness timed out.");
  }catch(error){
    try { await removeAdminEgressProxy(name,sessionId,client); }
    catch { console.error("RUNNER protected egress startup cleanup deferred"); }
    throw error;
  }
}
function notFound(error:unknown){return (error as {statusCode?:number})?.statusCode===404;}
async function removeOwnerValidated(name:string,client:Docker,verify:(i:Docker.ContainerInspectInfo)=>void){
  const c=client.getContainer(name); let i:Docker.ContainerInspectInfo;
  try{i=await c.inspect();}catch(e){if(notFound(e))return;throw e;}
  verify(i);
  // Remove the exact inspected container ID, not a potentially reused name.
  if(!/^[a-f0-9]{64}$/.test(i.Id))throw new Error("Unverified cleanup container ID.");
  try{await client.getContainer(i.Id).remove({force:true});}catch(e){if(!notFound(e))throw e;}
  for(let attempt=0;attempt<5;attempt++){
    try{await c.inspect();}catch(e){if(notFound(e))return;throw e;}
    await new Promise<void>(r=>setTimeout(r,100));
  }
  throw new Error("Administrator egress component remains after removal.");
}
async function removeOwnedComponent(sessionId:string,role:Role,client:Docker){
  const name=componentName(sessionId,role);
  await removeOwnerValidated(name,client,i=>{
    if(i.Name!==`/${name}` || Object.entries(componentLabels(sessionId,role)).some(([k,v])=>i.Config.Labels?.[k]!==v))throw new Error("Foreign administrator egress component.");
  });
}
/** Always inspect all three deterministic identities even if a prior cleanup
 * already removed the gateway. Preserve the holder if gateway/helper cleanup fails. */
export async function removeAdminEgressProxy(name:string,sessionId:string,client:Docker=docker):Promise<void>{
  if(name!==adminEgressProxyName(sessionId))throw new Error("Wrong proxy owner.");
  await removeOwnerValidated(name,client,i=>{
    // Permit removal of old DEV gateway layout, but never create it again.
    if(i.Name!==`/${name}` || Object.entries(adminEgressProxyLabels(sessionId)).some(([k,v])=>i.Config.Labels?.[k]!==v))throw new Error("Foreign administrator proxy.");
  });
  await removeOwnedComponent(sessionId,"firewall",client);
  await removeOwnedComponent(sessionId,"holder",client);
}
