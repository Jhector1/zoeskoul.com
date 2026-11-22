/** Supervised DEV ONLY. Require a fresh, separately filtered namespace before gateway startup. */
import type Docker from "dockerode";
import { parseAdminEgressPins, ipv4Value, type PinManifest } from "./adminEgressPins.js";
import { adminEgressPinsForConfiguration, renewalEligible } from "./adminEgressRenewal.js";
export { parseAdminEgressPins } from "./adminEgressPins.js";
import { docker } from "../docker/dockerClient.js";
import { AdminGrantError } from "./learningAdminGrant.js";
import { adminSessionNetworkName, verifyAdminSessionNetworkInspect } from "./adminSessionNetwork.js";

import { adminLabSwitchStatus, assertAdminLabSwitch } from "./learningAdminSwitch.js";
import { getSession } from "../sessions/sessionStore.js";
import { FULL_PRIVILEGES_TOPIC_SLUG } from "./learningAdminLessonPolicy.js";
import { readAdminVerifierLogOutput } from "./adminVerifierLogOutput.js";
import { AdminEgressOperationQueue, startRotationClock, assertRotationClock, rotationExpiry, parseFirewallFingerprint, verifyFirewallRenewed, executeRotation, type RotationClock } from "./adminEgressRotation.js";

const PREFIX = "zoeskoul-admin-egress-";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NAME = new RegExp(`^${PREFIX}sess_${UUID}$`);
const LABEL = "com.zoeskoul.learning.admin-egress";
const LABEL_VALUE = "v1";
const FIREWALL_PHASE = "2c8b2c-renewal-helper-dev-v2";
const GATEWAY_PHASE = "2c8b2a-pinned-policy-dev-v1";
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

type ProtectedConfig = { image: string; firewallImage: string; pins: PinManifest };
type AdmissionLease = { generation: number; hardLifetimeMs: number };
type RotationRecord = { config: ProtectedConfig; clock: RotationClock; generation: number; networkName: string; cidr: string; holderId: string; holderInode: string; holderIP: string; gatewayId: string; fingerprint: string };
const rotations = new Map<string, RotationRecord>();
const operations = new AdminEgressOperationQueue();
const liveRotationEnabled = () => renewalEligible(process.env) && process.env.ZOESKOUL_LEARNING_ADMIN_EGRESS_LIVE_RENEWAL === "true";

const imageID = /^sha256:[a-f0-9]{64}$/;
export function adminEgressConfig(configuration: NodeJS.ProcessEnv = process.env): ProtectedConfig | null {
  if (configuration.ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY !== "per-session-controlled-egress") return null;
  if (configuration.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK !== "false" || configuration.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE !== "development" || configuration.ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK !== "PROTECTED_LIFECYCLE_TEST_ONLY") throw new AdminGrantError(503, "Controlled egress requires the protected supervised development lifecycle.");
  const image=configuration.ZOESKOUL_LEARNING_ADMIN_EGRESS_PROXY_IMAGE ?? "";
  const firewallImage=configuration.ZOESKOUL_LEARNING_ADMIN_EGRESS_FIREWALL_IMAGE ?? "";
  if (!imageID.test(image) || !imageID.test(firewallImage) || image===firewallImage) throw new AdminGrantError(503,"Verified local gateway and firewall image IDs required.");
  try { return {image,firewallImage,pins:parseAdminEgressPins(adminEgressPinsForConfiguration(configuration))}; }
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
async function readFirewallEvidence(helper:Docker.Container):Promise<string> {
  const output=await deadline(helper.logs({stdout:true,stderr:true,follow:false,tail:4}),5000);
  // TTY output is not multiplexed. Reject arbitrary decoded objects and oversized logs.
  if(typeof output==="string") {if(Buffer.byteLength(output)>8192)throw new Error("Oversized firewall evidence.");return output;}
  return readAdminVerifierLogOutput(output);
}
function gatewayEnvironment(cidr:string,pins:PinManifest):string[] {
  return [`LAB_CLIENT_CIDR=${cidr}`,`LAB_EGRESS_PINS_JSON=${JSON.stringify(pins)}`];
}
function verifyGatewayEnvironment(env:string[]|null|undefined,expectedEnv:string[]):void {
  for(const expected of expectedEnv){const prefix=expected.slice(0,expected.indexOf("=")+1);const actual=(env??[]).filter(v=>v.startsWith(prefix));if(actual.length!==1||actual[0]!==expected)throw new Error("Gateway protected namespace/profile mismatch.");}
}
async function startProtectedGateway(sessionId:string,networkName:string,cidr:string,holder:Docker.Container,identity:{ip:string;inode:string},config:ProtectedConfig,client:Docker,guard:()=>void):Promise<string> {
  const name=adminEgressProxyName(sessionId), image=config.image,mode=`container:${holder.id}`;
  const gatewayEnv=gatewayEnvironment(cidr,config.pins);
  const verifyGatewayEnv=(env:string[]|null|undefined)=>verifyGatewayEnvironment(env,gatewayEnv);
    guard();
    const container=await client.createContainer({name,Image:image,User:"1000:1000",Labels:adminEgressProxyLabels(sessionId),WorkingDir:"/",Env:gatewayEnv,HostConfig:{...safeHost,NetworkMode:mode}});
    const beforeStart=await container.inspect();
    verifyAdminEgressProxyInspect(beforeStart,sessionId,image);
    if(!/^[a-f0-9]{64}$/.test(container.id) || beforeStart.Id!==container.id || beforeStart.HostConfig.NetworkMode!==mode || beforeStart.Mounts?.length || !exactSingleArg(beforeStart.Config.Entrypoint,"/gateway"))throw new Error("Gateway protected namespace/profile mismatch.");
    verifyGatewayEnv(beforeStart.Config.Env);
    guard();
    await container.start();
    guard();
    for(let attempt=0;attempt<30;attempt++){
      guard();
      const i=await container.inspect(); verifyAdminEgressProxyInspect(i,sessionId,image);
      if(i.Id!==container.id || i.HostConfig.NetworkMode!==mode || i.Mounts?.length)throw new Error("Gateway protected namespace/profile mismatch.");
      verifyGatewayEnv(i.Config.Env);
      if(!i.State.Running || !i.State.Health?.Status || i.State.Health.Status==="unhealthy")throw new Error("Gateway not healthy.");
      if(i.State.Health.Status==="healthy"){
        const final=await holderIdentity(holder,sessionId,networkName,cidr,config.firewallImage);
        if(final.inode!==identity.inode || final.ip!==identity.ip || config.pins.expiresAt-Math.floor(Date.now()/1000)<10)throw new Error("Protected namespace changed or pins expired.");
        guard();
        return container.id;
      }
      await new Promise<void>(r=>setTimeout(r,500));
    }
    throw new Error("Admin egress proxy readiness timed out.");
}
/** Protected gateway; there is no legacy unfiltered fallback. */
export function createAdminEgressProxy(sessionId:string,networkName:string,image:string,client:Docker=docker,configuration:NodeJS.ProcessEnv=process.env,lease?:AdmissionLease):Promise<string> {
  return operations.run(sessionId,()=>createProtectedProxy(sessionId,networkName,image,client,configuration,lease));
}
async function createProtectedProxy(sessionId:string,networkName:string,image:string,client:Docker,configuration:NodeJS.ProcessEnv,lease?:AdmissionLease):Promise<string> {
  const config=adminEgressConfig(configuration);
  const clock=lease ? startRotationClock(lease.hardLifetimeMs) : undefined;
  const guard=()=>{ if(lease && clock){assertAdminLabSwitch(lease.generation);assertRotationClock(clock);} };
  guard();
  if(!config || config.image!==image)throw new Error("Protected egress configuration required.");
  if(clock) {
    config.pins={...config.pins,expiresAt:Math.min(config.pins.expiresAt,clock.deadlineSeconds)};
    parseAdminEgressPins(JSON.stringify(config.pins));
  }
  const name=adminEgressProxyName(sessionId);
  const daemon=await client.info();
  if (!Array.isArray(daemon.SecurityOptions) || !daemon.SecurityOptions.includes("name=rootless"))throw new Error("Protected egress requires the rootless Docker daemon.");
  await verifyAdminEgressImage(image,client);
  await verifyFirewallImage(config.firewallImage,client);
  const cidr=await verifiedAdminGatewayCIDR(sessionId,networkName,client);
  // No untrusted gateway code executes until the trusted helper exits and is removed.
  try {
    guard();
    const holder=await client.createContainer({name:componentName(sessionId,"holder"),Image:config.firewallImage,User:"1000:1000",Labels:componentLabels(sessionId,"holder"),Entrypoint:["/usr/bin/sleep"],Cmd:["infinity"],HostConfig:{...safeHost,NetworkMode:"bridge"}});
    guard();
    await holder.start();
    guard();
    await client.getNetwork(networkName).connect({Container:holder.id,EndpointConfig:{Aliases:[PROXY_ALIAS]}});
    const identity=await holderIdentity(holder,sessionId,networkName,cidr,config.firewallImage);
    const mode=`container:${holder.id}`;
    guard();
    const args=[identity.inode,cidr,identity.ip,JSON.stringify(config.pins.hosts),String(config.pins.expiresAt)];
    const helper=await client.createContainer({name:componentName(sessionId,"firewall"),Image:config.firewallImage,User:"0:0",Tty:true,Labels:componentLabels(sessionId,"firewall"),Cmd:args,HostConfig:{...safeHost,NetworkMode:mode,CapAdd:["NET_ADMIN"]}});
    const hi=await helper.inspect();
    if(hi.Id!==helper.id || hi.Name!==`/${componentName(sessionId,"firewall")}` || hi.Image!==config.firewallImage || hi.Config.User!=="0:0" || !hi.Config.Tty || JSON.stringify(hi.Config.Cmd)!==JSON.stringify(args) || !exactSingleArg(hi.Config.Entrypoint,"/usr/local/bin/zoe-firewall-init") || hi.HostConfig.NetworkMode!==mode || hi.HostConfig.Privileged!==false || hi.HostConfig.ReadonlyRootfs!==true || hi.HostConfig.CapDrop?.join(",")!=="ALL" || !["NET_ADMIN","CAP_NET_ADMIN"].includes(hi.HostConfig.CapAdd?.join(",")??"") || !hi.HostConfig.SecurityOpt?.includes("no-new-privileges:true") || hi.Mounts?.length || Object.entries(componentLabels(sessionId,"firewall")).some(([k,v])=>hi.Config.Labels?.[k]!==v))throw new Error("Unverified firewall initializer profile.");
    guard();
    await helper.start();
    const result=await deadline(helper.wait(),15000);
    if(result.StatusCode!==0)throw new Error("Independent firewall installation failed.");
    const fingerprint=parseFirewallFingerprint(await readFirewallEvidence(helper));
    await removeOwnedComponent(sessionId,"firewall",client);
    const again=await holderIdentity(holder,sessionId,networkName,cidr,config.firewallImage);
    if(again.inode!==identity.inode || again.ip!==identity.ip)throw new Error("Holder identity changed after firewall installation.");
    const gatewayId = await startProtectedGateway(sessionId,networkName,cidr,holder,identity,config,client,guard);
    if(lease && clock && configuration===process.env) {
      rotations.set(sessionId,{config,clock,generation:lease.generation,networkName,cidr,holderId:holder.id,holderInode:identity.inode,holderIP:identity.ip,gatewayId,fingerprint});
    }
    return name;
  }catch(error){
    try { await removeProtectedProxy(name,sessionId,client); }
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
export function removeAdminEgressProxy(name:string,sessionId:string,client:Docker=docker):Promise<void>{
  if(name!==adminEgressProxyName(sessionId))return Promise.reject(new Error("Wrong proxy owner."));
  // Invalidate synchronously, so an in-flight rotation fails its next guard.
  rotations.delete(sessionId);
  return operations.run(sessionId,async()=>{rotations.delete(sessionId);await removeProtectedProxy(name,sessionId,client);});
}
async function removeProtectedProxy(name:string,sessionId:string,client:Docker):Promise<void>{
  if(name!==adminEgressProxyName(sessionId))throw new Error("Wrong proxy owner.");
  await removeOwnerValidated(name,client,i=>{
    // Permit removal of old DEV gateway layout, but never create it again.
    if(i.Name!==`/${name}` || Object.entries(adminEgressProxyLabels(sessionId)).some(([k,v])=>i.Config.Labels?.[k]!==v))throw new Error("Foreign administrator proxy.");
  });
  await removeOwnedComponent(sessionId,"firewall",client);
  await removeOwnedComponent(sessionId,"holder",client);
}

/** Only the supervised global Full Privileges product receives live rotation.
 * No browser route, client-selected scope, or student-supplied addresses. */
export async function rotateExistingSession(sessionId:string, client:Docker = docker):Promise<void> {
  await operations.run(sessionId,async()=>{
    const record=rotations.get(sessionId);
    const session=getSession(sessionId);
    if(!record || !session || !liveRotationEnabled() || !adminLabSwitchStatus().enabled ||
      session.labMode!=="admin" || session.adminTopicSlug!==FULL_PRIVILEGES_TOPIC_SLUG ||
      session.hardLifetimeMs!==7200000 || !["running","waiting_for_input"].includes(session.state)) return;
    const initialSession=session;
    const name=adminEgressProxyName(sessionId);
    const guard=()=>{
      if(!liveRotationEnabled() || rotations.get(sessionId)!==record || getSession(sessionId)!==initialSession ||
        !["running","waiting_for_input"].includes(initialSession.state) || initialSession.finalizedAt!=null ||
        initialSession.adminNetworkName!==record.networkName || initialSession.adminEgressProxyName!==name ||
        initialSession.hardLifetimeMs!==7200000 || initialSession.idleTimeoutMs!==1800000 ||
        Date.now()>=initialSession.lastActivityAt+initialSession.idleTimeoutMs ||
        Date.now()>=initialSession.createdAt+initialSession.hardLifetimeMs) throw new Error("Administrator session no longer authorized.");
      assertAdminLabSwitch(record.generation);
      assertRotationClock(record.clock);
    };
    // Do not attempt a mutation if there is no fresh advancing policy.
    const next=adminEgressConfig();
    if(!next || next.image!==record.config.image || next.firewallImage!==record.config.firewallImage) return;
    const effective=rotationExpiry(record.config.pins.expiresAt,next.pins.expiresAt,record.clock.deadlineSeconds,Math.floor(Date.now()/1000));
    if(effective===null)return;
    try{guard();}catch{return;}
    const holder=client.getContainer(record.holderId);
    const mode=`container:${record.holderId}`;
    const identity={ip:record.holderIP,inode:record.holderInode};
    const config:ProtectedConfig={...next,pins:{...next.pins,expiresAt:effective}};
    let replacementId="";
    const verifyOwnedNamespace=async()=>{
      const n=await client.getNetwork(record.networkName).inspect();
      verifyAdminSessionNetworkInspect(n,sessionId);
      if(ipv4Subnet(n).cidr!==record.cidr || Object.keys(n.Containers??{}).sort().join(",")!==[record.holderId,initialSession.containerId].sort().join(","))throw new Error("Administrator network membership changed.");
      const guest=await client.getContainer(initialSession.containerId).inspect();
      const labels=guest.Config.Labels??{};
      if(guest.Id!==initialSession.containerId || !/^[a-f0-9]{64}$/.test(guest.Id) || guest.Name!==`/zoeskoul_${sessionId}` || !guest.State.Running || labels["com.zoeskoul.runner.session"]!==sessionId || labels["com.zoeskoul.runner.purpose"]!=="learn" || labels["com.zoeskoul.runner.lab-mode"]!=="admin" || labels["com.zoeskoul.runner.owner"]!==initialSession.ownerKey?.slice(0,64) || guest.HostConfig.NetworkMode!==record.networkName || guest.HostConfig.Privileged!==false || Object.keys(guest.NetworkSettings?.Networks??{}).join(",")!==record.networkName)throw new Error("Administrator guest identity changed.");
      const actual=await holderIdentity(holder,sessionId,record.networkName,record.cidr,record.config.firewallImage);
      if(actual.inode!==identity.inode||actual.ip!==identity.ip)throw new Error("Administrator holder identity changed.");
    };
    await executeRotation({
      guard,
      verify:async()=>{
        const daemon=await client.info();if(!Array.isArray(daemon.SecurityOptions)||!daemon.SecurityOptions.includes("name=rootless"))throw new Error("Protected egress requires rootless Docker.");
        await verifyAdminEgressImage(next.image,client);await verifyFirewallImage(next.firewallImage,client);
        await verifyOwnedNamespace();
        const old=await client.getContainer(record.gatewayId).inspect();
        verifyAdminEgressProxyInspect(old,sessionId,next.image);
        if(old.Id!==record.gatewayId||!old.State.Running||old.HostConfig.NetworkMode!==mode||old.Mounts?.length||!exactSingleArg(old.Config.Entrypoint,"/gateway"))throw new Error("Unverified prior gateway.");
        verifyGatewayEnvironment(old.Config.Env,gatewayEnvironment(record.cidr,record.config.pins));
      },
      quiesce:async()=>{
        await removeOwnerValidated(name,client,i=>{if(i.Id!==record.gatewayId)throw new Error("Prior gateway identity changed.");verifyAdminEgressProxyInspect(i,sessionId,next.image);});
        try { await client.getContainer(record.gatewayId).inspect(); }
        catch(error){if(notFound(error))return;throw error;}
        throw new Error("Prior gateway remains after removal.");
      },
      apply:async()=>{
        await verifyOwnedNamespace();guard();
        const args=["-I","-B","/usr/local/lib/zoe-firewall/firewall_renewal_execute.py",identity.inode,record.cidr,identity.ip,record.fingerprint,JSON.stringify({previous:record.config.pins,next:next.pins}),String(record.clock.deadlineSeconds)];
        const helper=await client.createContainer({name:componentName(sessionId,"firewall"),Image:next.firewallImage,User:"0:0",Tty:true,Entrypoint:["/usr/bin/python3"],Cmd:args,Labels:componentLabels(sessionId,"firewall"),HostConfig:{...safeHost,NetworkMode:mode,CapAdd:["NET_ADMIN"]}});
        const h=await helper.inspect();
        if(h.Id!==helper.id||h.Name!==`/${componentName(sessionId,"firewall")}`||h.Image!==next.firewallImage||h.Config.User!=="0:0"||!h.Config.Tty||!exactSingleArg(h.Config.Entrypoint,"/usr/bin/python3")||JSON.stringify(h.Config.Cmd)!==JSON.stringify(args)||h.HostConfig.NetworkMode!==mode||h.HostConfig.Privileged!==false||h.HostConfig.ReadonlyRootfs!==true||h.HostConfig.CapDrop?.join(",")!=="ALL"||!["NET_ADMIN","CAP_NET_ADMIN"].includes(h.HostConfig.CapAdd?.join(",")??"")||!h.HostConfig.SecurityOpt?.includes("no-new-privileges:true")||h.Mounts?.length||Object.entries(componentLabels(sessionId,"firewall")).some(([k,v])=>h.Config.Labels?.[k]!==v))throw new Error("Unverified firewall renewal helper.");
        guard();await helper.start();
        const status=await deadline(helper.wait(),15000);
        if(status.StatusCode!==0)throw new Error("Firewall renewal failed.");
        verifyFirewallRenewed(await readFirewallEvidence(helper),effective);
        await removeOwnedComponent(sessionId,"firewall",client);
      },
      replace:async()=>{await verifyOwnedNamespace();guard();replacementId=await startProtectedGateway(sessionId,record.networkName,record.cidr,holder,identity,config,client,guard);await verifyOwnedNamespace();},
      commit:()=>{record.config=config;record.gatewayId=replacementId;console.info("RUNNER existing admin egress renewed",{expiresAt:effective});},
      abort:async()=>{rotations.delete(sessionId);await removeProtectedProxy(name,sessionId,client);},
    });
  });
}
let rotationLoopStarted=false;
export function startAdminEgressRotation():void {
  if(rotationLoopStarted||!liveRotationEnabled())return;
  rotationLoopStarted=true;
  const tick=async()=>{
    if(liveRotationEnabled())for(const id of [...rotations.keys()]){
      try{await rotateExistingSession(id);}catch{console.warn("RUNNER existing admin egress rotation failed; no renewal success reported");}
    }
    const timer=setTimeout(()=>{void tick();},30000);timer.unref?.();
  };
  void tick();
}
