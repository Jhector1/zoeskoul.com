import {describe,expect,it,vi} from "vitest";
import {Readable} from "node:stream";
import {adminEgressConfig,adminEgressProxyName,adminEgressProxyLabels,parseAdminEgressPins,verifiedAdminGatewayCIDR,createAdminEgressProxy,removeAdminEgressProxy,verifyAdminEgressProxyInspect} from "./adminEgressProxy.js";
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
function fixture(opts:{badExit?:boolean;badHolder?:boolean;badGateway?:boolean;extraHelperCaps?:boolean;sticky?:string;gatewayImageEntrypoint?:string|string[]}={}){
 const events:string[]=[];const containers=new Map<string,any>();
 const createContainer=vi.fn(async (spec:any)=>{
  const role=spec.name.endsWith("-holder")?"holder":spec.name.endsWith("-firewall")?"firewall":"gateway";
  const id=role==="holder"?holder:role==="firewall"?helper:gateway;
  const i:any={Id:id,Name:`/${spec.name}`,Image:spec.Image,Config:{User:spec.User,Labels:spec.Labels,Env:spec.Env,Cmd:spec.Cmd,Entrypoint:spec.Entrypoint??[role==="gateway"?"/gateway":"/usr/local/bin/zoe-firewall-init"]},HostConfig:{...spec.HostConfig},Mounts:[],State:{Running:false,Health:{Status:"healthy"}},NetworkSettings:{Networks:role==="holder"?{bridge:{},[network]:{IPAddress:"172.25.0.2",Aliases:["zoe-egress-proxy"]}}:{}}};
  if(role==="holder"&&opts.badHolder)i.Config.Labels={};
  if(role==="firewall"&&opts.extraHelperCaps)i.HostConfig.CapAdd=["NET_ADMIN","SYS_ADMIN"];
  if(role==="gateway"&&opts.badGateway)i.Config.Env=[];
  const c={id,inspect:async()=>{if(!containers.has(id))throw absent();return i;},start:async()=>{events.push(`start:${role}`);i.State.Running=true;},wait:async()=>{events.push("wait:firewall");return {StatusCode:opts.badExit?1:0};},exec:async()=>({start:async()=>Readable.from(["net:[12345]\n"]),inspect:async()=>({ExitCode:0})}),remove:async()=>{events.push(`remove:${role}`);if(opts.sticky!==role){containers.delete(id);containers.delete(spec.name);}}};
  containers.set(id,c);containers.set(spec.name,c);events.push(`create:${role}`);return c;
 });
 const client={info:async()=>({SecurityOptions:["name=rootless"]}),createContainer,getContainer:(n:string)=>containers.get(n)??{inspect:async()=>{throw absent();}},getImage:(id:string)=>({inspect:async()=>id===image?{Id:id,Config:{User:"1000:1000",Entrypoint:opts.gatewayImageEntrypoint??["/gateway"],Labels:{"com.zoeskoul.learning.egress-proxy":"v1","com.zoeskoul.learning.egress-gateway-phase":"2c3-development-audit-only"}}}:{Id:id,Config:{User:"0:0",Entrypoint:["/usr/local/bin/zoe-firewall-init"],Labels:{"com.zoeskoul.learning.firewall-initializer":"protected-lifecycle-dev-v1"}}}}),getNetwork:(n:string)=>({inspect:async()=>n===network?lab():bridge(),connect:async()=>{events.push("connect:holder");}})};
 return {events,containers,client,createContainer};
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
  const f=fixture({badGateway:true});await expect(start(f)).rejects.toThrow("namespace/profile");expect(f.events.slice(-2)).toEqual(["remove:gateway","remove:holder"]);
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
