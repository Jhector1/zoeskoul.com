import {describe,expect,it,vi} from "vitest";
import {createSession,deleteSession} from "../sessions/sessionStore.js";
import {setAdminLabSwitch} from "./learningAdminSwitch.js";
import {Readable} from "node:stream";
import {adminEgressConfig,adminEgressProxyName,adminEgressProxyLabels,parseAdminEgressPins,verifiedAdminGatewayCIDR,createAdminEgressProxy,removeAdminEgressProxy,verifyAdminEgressProxyInspect,rotateExistingSession} from "./adminEgressProxy.js";
import {adminSessionNetworkName,adminSessionNetworkLabels} from "./adminSessionNetwork.js";
const sid="sess_11111111-1111-4111-8111-111111111111";
const name=adminEgressProxyName(sid), network=adminSessionNetworkName(sid), cidr="172.25.0.0/16";
const image=`sha256:${"a".repeat(64)}`, firewall=`sha256:${"b".repeat(64)}`;
const holder="c".repeat(64), helper="d".repeat(64), gateway="e".repeat(64);
const hosts={"archive.ubuntu.com":["185.125.190.81"],"security.ubuntu.com":["185.125.190.82"],"example.com":["93.184.216.34"]};
const manifest=()=>({expiresAt:Math.floor(Date.now()/1000)+600,hosts});
const config=()=>({ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY:"per-session-controlled-egress",ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK:"false",ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE:"development",ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK:"PROTECTED_LIFECYCLE_TEST_ONLY",ZOESKOUL_LEARNING_ADMIN_EGRESS_PROXY_IMAGE:image,ZOESKOUL_LEARNING_ADMIN_EGRESS_FIREWALL_IMAGE:firewall,ZOESKOUL_LEARNING_ADMIN_EGRESS_PINS_JSON:JSON.stringify(manifest())});
const lab=()=>({Name:network,Driver:"bridge",Internal:true,EnableIPv6:false,Attachable:false,Labels:adminSessionNetworkLabels(sid),Containers:{},IPAM:{Config:[{Subnet:cidr}]}});
const bridge=()=>({Name:"bridge",Driver:"bridge",Internal:false,EnableIPv6:false,IPAM:{Config:[{Subnet:"172.17.0.0/16"}]}});
const absent=()=>Object.assign(new Error("not found"),{statusCode:404});
function fixture(opts:{badExit?:boolean;badHolder?:boolean;badGateway?:boolean;extraHelperCaps?:boolean;sticky?:string;gatewayImageEntrypoint?:string|string[];duplicatePins?:boolean;badFingerprint?:boolean;renewalFails?:boolean;revokeDuringRenewal?:()=>void;wrongRenewalEvidence?:boolean;foreignEndpoint?:boolean}={}){
 const events:string[]=[];const containers=new Map<string,any>();
 let gatewayCount=0;let guestId:string|undefined;
 const createContainer=vi.fn(async (spec:any)=>{
  const role=spec.name.endsWith("-holder")?"holder":spec.name.endsWith("-firewall")?"firewall":"gateway";
  const id=role==="holder"?holder:role==="firewall"?helper:(gatewayCount++===0?gateway:"f".repeat(64));
  const renewing=role==="firewall"&&spec.Entrypoint?.[0]==="/usr/bin/python3";
  const i:any={Id:id,Name:`/${spec.name}`,Image:spec.Image,Config:{User:spec.User,Tty:spec.Tty,Labels:spec.Labels,Env:spec.Env,Cmd:spec.Cmd,Entrypoint:spec.Entrypoint??[role==="gateway"?"/gateway":"/usr/local/bin/zoe-firewall-init"]},HostConfig:{...spec.HostConfig},Mounts:[],State:{Running:false,Health:{Status:"healthy"}},NetworkSettings:{Networks:role==="holder"?{bridge:{},[network]:{IPAddress:"172.25.0.2",Aliases:["zoe-egress-proxy"]}}:{}}};
  if(role==="holder"&&opts.badHolder)i.Config.Labels={};
  if(role==="firewall"&&opts.extraHelperCaps)i.HostConfig.CapAdd=["NET_ADMIN","SYS_ADMIN"];
  if(role==="gateway"&&opts.badGateway)i.Config.Env=[];
  if(role==="gateway"&&opts.duplicatePins)i.Config.Env=[...i.Config.Env,i.Config.Env.find((v:string)=>v.startsWith("LAB_EGRESS_PINS_JSON="))];
  const c={id,inspect:async()=>{if(!containers.has(id))throw absent();return i;},start:async()=>{events.push(`start:${role}`);i.State.Running=true;},wait:async()=>{events.push("wait:firewall");if(renewing)opts.revokeDuringRenewal?.();return {StatusCode:opts.badExit||(renewing&&opts.renewalFails)?1:0};},logs:async()=>Buffer.from(renewing?`ZOE_FIREWALL_RENEWED_AND_VERIFIED expiresAt=${opts.wrongRenewalEvidence?1:Math.min(JSON.parse(spec.Cmd[7]).next.expiresAt,Number(spec.Cmd[8]))}`:opts.badFingerprint?"bad fingerprint":`ZOE_FIREWALL_STRUCTURE_SHA256=${"f".repeat(64)}\nZOE_FIREWALL_INSTALLED_AND_VERIFIED\n`),exec:async()=>({start:async()=>Readable.from(["net:[12345]\n"]),inspect:async()=>({ExitCode:0})}),remove:async()=>{events.push(`remove:${role}`);if(opts.sticky!==role){containers.delete(id);containers.delete(spec.name);}}};
  containers.set(id,c);containers.set(spec.name,c);events.push(`create:${role}`);return c;
 });
 const client={info:async()=>({SecurityOptions:["name=rootless"]}),createContainer,getContainer:(n:string)=>containers.get(n)??{inspect:async()=>{throw absent();}},getImage:(id:string)=>({inspect:async()=>id===image?{Id:id,Config:{User:"1000:1000",Entrypoint:opts.gatewayImageEntrypoint??["/gateway"],Labels:{"com.zoeskoul.learning.egress-proxy":"v1","com.zoeskoul.learning.egress-gateway-phase":"2c8b2a-pinned-policy-dev-v1"}}}:{Id:id,Config:{User:"0:0",Entrypoint:["/usr/local/bin/zoe-firewall-init"],Labels:{"com.zoeskoul.learning.firewall-initializer":"2c8b2c-renewal-helper-dev-v2"}}}}),getNetwork:(n:string)=>({inspect:async()=>n===network?{...lab(),Containers:guestId?{[holder]:{},[guestId]:{},...(opts.foreignEndpoint?{foreign:{}}:{})}:{}}:bridge(),connect:async()=>{events.push("connect:holder");}})};
 const addGuest=(id:string,owner:string)=>{guestId=id;containers.set(id,{inspect:async()=>({Id:id,Name:`/zoeskoul_${sid}`,Config:{Labels:{"com.zoeskoul.runner.session":sid,"com.zoeskoul.runner.purpose":"learn","com.zoeskoul.runner.lab-mode":"admin","com.zoeskoul.runner.owner":owner}},State:{Running:true},HostConfig:{NetworkMode:network,Privileged:false},NetworkSettings:{Networks:{[network]:{}}}})});};
 return {events,containers,client,createContainer,addGuest};
}
const start=(f:ReturnType<typeof fixture>)=>createAdminEgressProxy(sid,network,image,f.client as any,config());
describe("protected administrator egress lifecycle",()=>{
 it("keeps offline unchanged and rejects legacy ACK, production and missing image",()=>{
  expect(adminEgressConfig({})).toBeNull();expect(adminEgressConfig(config())?.image).toBe(image);
  for(const patch of [{ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK:"PROXY_LIFECYCLE_TEST_ONLY"},{ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE:"production"},{ZOESKOUL_LEARNING_ADMIN_EGRESS_FIREWALL_IMAGE:"latest"},{ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK:"true"}])expect(()=>adminEgressConfig({...config(),...patch})).toThrow();
 });
 it("rejects private, malformed, multicast and expired pins",()=>{
  for(const ip of ["127.0.0.1","10.1.2.3","169.254.169.254","100.64.0.1","224.1.2.3","192.0.2.1","001.2.3.4","::1","256.0.0.1"])expect(()=>parseAdminEgressPins(JSON.stringify({...manifest(),hosts:{...hosts,"example.com":[ip]}}))).toThrow();
  expect(()=>parseAdminEgressPins(JSON.stringify({...manifest(),expiresAt:1}))).toThrow();
  expect(()=>parseAdminEgressPins(JSON.stringify({...manifest(),hosts:{...hosts,"other.example":["8.8.8.8"]}}))).toThrow();
 });
 it("validates private session CIDR, owner and bridge overlap",async()=>{
  const c=(l:any,b:any)=>({getNetwork:(n:string)=>({inspect:async()=>n===network?l:b})});
  await expect(verifiedAdminGatewayCIDR(sid,network,c(lab(),bridge()) as any)).resolves.toBe(cidr);
  await expect(verifiedAdminGatewayCIDR(sid,"bridge",c(lab(),bridge()) as any)).rejects.toThrow();
  for(const bad of ["172.25.1.0/16","8.8.8.0/24","100.64.0.0/16","172.25.0.0/29","fd00::/64"])await expect(verifiedAdminGatewayCIDR(sid,network,c({...lab(),IPAM:{Config:[{Subnet:bad}]}},bridge()) as any)).rejects.toThrow();
  await expect(verifiedAdminGatewayCIDR(sid,network,c({...lab(),Labels:{}},bridge()) as any)).rejects.toThrow();
  await expect(verifiedAdminGatewayCIDR(sid,network,c(lab(),{...bridge(),IPAM:{Config:[{Subnet:cidr}]}}) as any)).rejects.toThrow();
 });
 it("rejects rootful daemon before creating resources",async()=>{
  const f=fixture(); f.client.info=async()=>({SecurityOptions:[]});
  await expect(start(f)).rejects.toThrow("rootless Docker");expect(f.events).toEqual([]);
 });
 it("rejects string or multi-argument gateway image entrypoints before resource creation",async()=>{
  for(const entrypoint of ["/gateway",["/gateway",""],["/gateway,"]]){
   const f=fixture({gatewayImageEntrypoint:entrypoint});
   await expect(start(f)).rejects.toThrow("Untrusted or incompatible");expect(f.events).toEqual([]);
  }
 });
 it("rejects non-array daemon security options before resource creation",async()=>{
  const f=fixture(); f.client.info=async()=>({SecurityOptions:"name=rootless" as any});
  await expect(start(f)).rejects.toThrow("rootless Docker");expect(f.events).toEqual([]);
 });
 it("creates holder, installs and removes firewall, then starts gateway in holder namespace",async()=>{
  const f=fixture();await expect(start(f)).resolves.toBe(name);
  expect(f.events).toEqual(["create:holder","start:holder","connect:holder","create:firewall","start:firewall","wait:firewall","remove:firewall","create:gateway","start:gateway"]);
  const specs=f.createContainer.mock.calls.map(c=>c[0]);
  expect(specs[1].HostConfig).toMatchObject({NetworkMode:`container:${holder}`,CapDrop:["ALL"],CapAdd:["NET_ADMIN"],Privileged:false});
  expect(specs[2].HostConfig).toMatchObject({NetworkMode:`container:${holder}`,CapDrop:["ALL"],Privileged:false});
  expect(specs[2].HostConfig.CapAdd).toBeUndefined();
  expect(specs[0].HostConfig.ExtraHosts).toBeUndefined();
  const raw=specs[2].Env.find((v:string)=>v.startsWith("LAB_EGRESS_PINS_JSON=")).split("=")[1];
  const policy=JSON.parse(raw);
  expect(policy.hosts).toEqual(hosts);
  expect(JSON.parse(specs[1].Cmd[3])).toEqual(policy.hosts);
  expect(Number(specs[1].Cmd[4])).toBe(policy.expiresAt);
  await removeAdminEgressProxy(name,sid,f.client as any);
  expect(f.events.slice(-2)).toEqual(["remove:gateway","remove:holder"]);expect(f.containers.size).toBe(0);
 });
 it("helper failure never creates gateway; cleans helper before holder",async()=>{
  const f=fixture({badExit:true});await expect(start(f)).rejects.toThrow("firewall installation");expect(f.events).not.toContain("create:gateway");expect(f.events.slice(-2)).toEqual(["remove:firewall","remove:holder"]);
 });
 it("rejects extra helper capabilities before execution",async()=>{
  const f=fixture({extraHelperCaps:true});await expect(start(f)).rejects.toThrow("initializer profile");expect(f.events).not.toContain("start:firewall");expect(f.events).not.toContain("create:gateway");
 });
 it("unverified holder prevents helper/gateway creation",async()=>{
  const f=fixture({badHolder:true});await expect(start(f)).rejects.toThrow("namespace holder");expect(f.events).not.toContain("create:firewall");
 });
 it("failed gateway readiness cleans gateway before holder",async()=>{
  const f=fixture({badGateway:true});await expect(start(f)).rejects.toThrow("namespace/profile");expect(f.events).not.toContain("start:gateway");expect(f.events.slice(-2)).toEqual(["remove:gateway","remove:holder"]);
 });
 it("rejects duplicate pin environment entries before gateway start",async()=>{
  const f=fixture({duplicatePins:true});await expect(start(f)).rejects.toThrow("namespace/profile");expect(f.events).not.toContain("start:gateway");
 });
 it("persistent helper blocks admission and preserves holder",async()=>{
  const f=fixture({sticky:"firewall"});await expect(start(f)).rejects.toThrow("remains");expect(f.events).not.toContain("create:gateway");expect(f.events).not.toContain("remove:holder");
 });
 it("persistent gateway blocks holder removal on revoke",async()=>{
  const f=fixture({sticky:"gateway"});await start(f);await expect(removeAdminEgressProxy(name,sid,f.client as any)).rejects.toThrow("remains");expect(f.events).not.toContain("remove:holder");
 });
 it("rejects direct bridge proxy inspect",()=>{
  expect(()=>verifyAdminEgressProxyInspect({Name:`/${name}`,Image:image,Config:{User:"1000:1000",Labels:adminEgressProxyLabels(sid)},HostConfig:{NetworkMode:"bridge",Privileged:false,ReadonlyRootfs:true,CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],Memory:64*1024*1024,MemorySwap:64*1024*1024,PidsLimit:32}},sid,image)).toThrow();
 });
});

it("rejects missing initializer fingerprint even with successful exit",async()=>{const f=fixture({badFingerprint:true});await expect(start(f)).rejects.toThrow("initializer evidence");expect(f.events).not.toContain("create:gateway");});
async function liveFixture(opts:Parameters<typeof fixture>[0]={}){
 const f=fixture(opts);const guest="1".repeat(64),owner="u:"+"2".repeat(62);
 for(const [key,value] of Object.entries({...config(),RUNNER_EXECUTION_POOL:"zoeskoul-learning",ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED:"true",ZOESKOUL_LEARNING_ADMIN_EGRESS_LIVE_RENEWAL:"true"}))vi.stubEnv(key,value);
 const generation=setAdminLabSwitch(true).generation;
 await createAdminEgressProxy(sid,network,image,f.client as any,process.env,{generation,hardLifetimeMs:7200000});
 f.addGuest(guest,owner);
 const session=createSession({id:sid,ownerKey:owner,kind:"shell",labMode:"admin",adminTopicSlug:"full-privileges",adminNetworkName:network,adminEgressProxyName:name,containerId:guest,workspaceDir:"",idleTimeoutMs:1800000,hardLifetimeMs:7200000});
 session.state="waiting_for_input";
 vi.stubEnv("ZOESKOUL_LEARNING_ADMIN_EGRESS_PINS_JSON",JSON.stringify({...manifest(),expiresAt:Math.floor(Date.now()/1000)+1800}));
 return {f,session,guest};
}
async function finishLive(f?:ReturnType<typeof fixture>){try{if(f)await removeAdminEgressProxy(name,sid,f.client as any);}finally{deleteSession(sid);setAdminLabSwitch(false);vi.unstubAllEnvs();}}
it("rotates gateway and firewall while keeping the student container",async()=>{let f:ReturnType<typeof fixture>|undefined;try{const x=await liveFixture();f=x.f;await rotateExistingSession(sid,f.client as any);expect(f.events.slice(9)).toEqual(["remove:gateway","create:firewall","start:firewall","wait:firewall","remove:firewall","create:gateway","start:gateway"]);expect(f.containers.has(x.guest)).toBe(true);expect(f.containers.has(holder)).toBe(true);expect(f.containers.has(gateway)).toBe(false);expect(f.containers.has("f".repeat(64))).toBe(true);}finally{await finishLive(f);}});
it("failed transaction removes egress and never recreates gateway",async()=>{let f:ReturnType<typeof fixture>|undefined;try{const x=await liveFixture({renewalFails:true});f=x.f;await expect(rotateExistingSession(sid,f.client as any)).rejects.toThrow("Firewall renewal failed");expect(f.events.filter(v=>v==="create:gateway")).toHaveLength(1);expect(f.containers.has(x.guest)).toBe(true);expect(f.containers.has(holder)).toBe(false);}finally{await finishLive(f);}});
it("renewal evidence mismatch prevents replacement",async()=>{let f:ReturnType<typeof fixture>|undefined;try{const x=await liveFixture({wrongRenewalEvidence:true});f=x.f;await expect(rotateExistingSession(sid,f.client as any)).rejects.toThrow("renewal evidence");expect(f.events.filter(v=>v==="create:gateway")).toHaveLength(1);}finally{await finishLive(f);}});
it("operator revocation during helper prevents gateway replacement",async()=>{let f:ReturnType<typeof fixture>|undefined;try{const x=await liveFixture({revokeDuringRenewal:()=>{setAdminLabSwitch(false);}});f=x.f;await expect(rotateExistingSession(sid,f.client as any)).rejects.toThrow();expect(f.events.filter(v=>v==="create:gateway")).toHaveLength(1);}finally{await finishLive(f);}});
it("unexpected endpoint prevents renewal helper execution",async()=>{let f:ReturnType<typeof fixture>|undefined;try{const x=await liveFixture({foreignEndpoint:true});f=x.f;await expect(rotateExistingSession(sid,f.client as any)).rejects.toThrow("membership changed");expect(f.events.filter(v=>v==="create:firewall")).toHaveLength(1);}finally{await finishLive(f);}});
it("feature flag OFF leaves old gateway and policy untouched",async()=>{let f:ReturnType<typeof fixture>|undefined;try{const x=await liveFixture();f=x.f;vi.stubEnv("ZOESKOUL_LEARNING_ADMIN_EGRESS_LIVE_RENEWAL","false");await rotateExistingSession(sid,f.client as any);expect(f.events).toHaveLength(9);}finally{await finishLive(f);}});

it("terminal cancellation during helper cannot be followed by gateway replacement",async()=>{let f:ReturnType<typeof fixture>|undefined;let session:ReturnType<typeof createSession>|undefined;try{const x=await liveFixture({revokeDuringRenewal:()=>{if(session){session.state="canceled";session.finalizedAt=Date.now();}}});f=x.f;session=x.session;await expect(rotateExistingSession(sid,f.client as any)).rejects.toThrow();expect(f.events.filter(v=>v==="create:gateway")).toHaveLength(1);}finally{await finishLive(f);}});
it("graded administrator sessions do not receive live renewal",async()=>{let f:ReturnType<typeof fixture>|undefined;try{const x=await liveFixture();f=x.f;x.session.adminTopicSlug="final-capstone-secure-project";await rotateExistingSession(sid,f.client as any);expect(f.events).toHaveLength(9);}finally{await finishLive(f);}});
