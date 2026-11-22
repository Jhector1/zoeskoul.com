import { describe, expect, it } from "vitest";
import { emptyAdminLabResources, prepareAdminLabResources, removeVerifiedAdminLabResources, type AdminLabResourceOperations } from "./adminLabRuntimeResources.js";
const sessionId="sess_test";
const network="network-sess_test", proxy="proxy-sess_test", volume="volume-sess_test";
function fixture(options: {isolation?:boolean; egress?:boolean; fail?:string; revoke?:number; networkAbsent?:boolean; volumeAbsent?:boolean; mismatch?:string}={}) {
  const calls:string[]=[];
  const evidence=emptyAdminLabResources();
  let gates=0;
  function op(name:string) {calls.push(name); if(options.fail===name)throw new Error("FAIL_"+name);}
  const ops:AdminLabResourceOperations={
    assertAuthorized:()=>{op("gate"); if(++gates===options.revoke)throw new Error("REVOKED");},
    isolationEnabled:()=>options.isolation!==false,
    egressImage:()=>options.egress!==false?"pinned":null,
    networkName:id=>"network-"+id,proxyName:id=>"proxy-"+id,volumeName:id=>"volume-"+id,
    createNetwork:async id=>{expect(evidence.networkName).toBe("network-"+id);op("create-network");return options.mismatch==="network"?"wrong":network;},
    createProxy:async (id,n,image)=>{expect(evidence.proxyName).toBe("proxy-"+id);expect(n).toBe(network);expect(image).toBe("pinned");op("create-proxy");return options.mismatch==="proxy"?"wrong":proxy;},
    createVolume:async id=>{expect(evidence.volumeName).toBe("volume-"+id);op("create-volume");return options.mismatch==="volume"?"wrong":volume;},
    removeProxy:async (n,id)=>{expect(n).toBe(proxy);expect(id).toBe(sessionId);op("remove-proxy");},
    removeNetwork:async (n,id)=>{expect(n).toBe(network);expect(id).toBe(sessionId);op("remove-network");},
    removeVolume:async (n,id)=>{expect(n).toBe(volume);expect(id).toBe(sessionId);op("remove-volume");},
    networkAbsent:async n=>{expect(n).toBe(network);op("verify-network");return options.networkAbsent!==false;},
    volumeAbsent:async n=>{expect(n).toBe(volume);op("verify-volume");return options.volumeAbsent!==false;},
  };
  return {calls,ops,evidence,prepare:()=>prepareAdminLabResources(sessionId,evidence,ops)};
}
async function fails(action:()=>Promise<unknown>,message:string){let failure:unknown;try{await action();}catch(e){failure=e;}expect(failure instanceof Error?failure.message:null).toBe(message);}
const all={networkName:network,proxyName:proxy,volumeName:volume};
describe("shared administrator infrastructure lifecycle",()=>{
  it("creates network then protected proxy then volume with authorization guards",async()=>{const f=fixture();await f.prepare();expect(f.evidence).toEqual(all);expect(f.calls).toEqual(["gate","create-network","gate","create-proxy","gate","create-volume","gate"]);});
  it("offline non-isolated profile allocates only a volume",async()=>{const f=fixture({isolation:false});await f.prepare();expect(f.evidence).toEqual({networkName:null,proxyName:null,volumeName:volume});expect(f.calls).toEqual(["gate","create-volume","gate"]);});
  it("internal network without egress does not create a gateway",async()=>{const f=fixture({egress:false});await f.prepare();expect(f.evidence).toEqual({networkName:network,proxyName:null,volumeName:volume});});
  it("rejects nonempty allocation evidence before mutation",async()=>{const f=fixture();f.evidence.volumeName=volume;await fails(f.prepare,"ADMIN_RESOURCE_EVIDENCE_NOT_EMPTY");expect(f.calls).toEqual([]);});
  it("rejects revoked admission before any create",async()=>{const f=fixture({revoke:1});await fails(f.prepare,"REVOKED");expect(f.evidence).toEqual(emptyAdminLabResources());});
  it("revocation after network stops proxy and volume allocation",async()=>{const f=fixture({revoke:2});await fails(f.prepare,"REVOKED");expect(f.evidence).toEqual({networkName:network,proxyName:null,volumeName:null});});
  it("revocation after proxy stops volume allocation",async()=>{const f=fixture({revoke:3});await fails(f.prepare,"REVOKED");expect(f.evidence).toEqual({networkName:network,proxyName:proxy,volumeName:null});});
  it("revocation after volume retains evidence for teardown",async()=>{const f=fixture({revoke:4});await fails(f.prepare,"REVOKED");expect(f.evidence).toEqual(all);});
  for(const [step,expected] of [["network",{networkName:network,proxyName:null,volumeName:null}],["proxy",{networkName:network,proxyName:proxy,volumeName:null}],["volume",all]] as const){
    it(`retains ${step} identity after ambiguous daemon create`,async()=>{const f=fixture({fail:"create-"+step});await fails(f.prepare,"FAIL_create-"+step);expect(f.evidence).toEqual(expected);});
    it(`rejects incorrect ${step} identity without discarding expected identity`,async()=>{const f=fixture({mismatch:step});await fails(f.prepare,"ADMIN_"+step.toUpperCase()+"_IDENTITY_MISMATCH");expect(f.evidence).toEqual(expected);});
  }
  it("tears down verified proxy, network, volume in order",async()=>{const f=fixture();await removeVerifiedAdminLabResources(sessionId,all,f.ops);expect(f.calls).toEqual(["remove-proxy","remove-network","verify-network","remove-volume","verify-volume"]);});
  it("rejects a foreign resource before deleting any other resource",async()=>{const f=fixture();await fails(()=>removeVerifiedAdminLabResources(sessionId,{...all,volumeName:"foreign"},f.ops),"ADMIN_RESOURCE_IDENTITY_MISMATCH");expect(f.calls).toEqual([]);});
  it("rejects proxy without its network identity",async()=>{const f=fixture();await fails(()=>removeVerifiedAdminLabResources(sessionId,{...all,networkName:null},f.ops),"ADMIN_RESOURCE_IDENTITY_MISMATCH");expect(f.calls).toEqual([]);});
  it("does not continue after proxy cleanup fails",async()=>{const f=fixture({fail:"remove-proxy"});await fails(()=>removeVerifiedAdminLabResources(sessionId,all,f.ops),"FAIL_remove-proxy");expect(f.calls).toEqual(["remove-proxy"]);});
  it("does not release volume on unverified network removal",async()=>{const f=fixture({networkAbsent:false});await fails(()=>removeVerifiedAdminLabResources(sessionId,all,f.ops),"Previous administrator network remains.");expect(f.calls).toEqual(["remove-proxy","remove-network","verify-network"]);});
  it("rejects successful remove without volume absence",async()=>{const f=fixture({volumeAbsent:false});await fails(()=>removeVerifiedAdminLabResources(sessionId,all,f.ops),"Previous administrator volume remains.");});
  it("supports partial creation cleanup after verified guest absence",async()=>{const f=fixture();await removeVerifiedAdminLabResources(sessionId,{networkName:network,proxyName:null,volumeName:null},f.ops);expect(f.calls).toEqual(["remove-network","verify-network"]);});
  it("empty partial allocation requires no mutation",async()=>{const f=fixture();await removeVerifiedAdminLabResources(sessionId,emptyAdminLabResources(),f.ops);expect(f.calls).toEqual([]);});
});
