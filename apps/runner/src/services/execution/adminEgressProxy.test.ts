import {describe, expect, it, vi} from "vitest";
import {
  adminEgressConfig, adminEgressProxyName, adminEgressProxyLabels,
  verifiedAdminGatewayCIDR, createAdminEgressProxy, removeAdminEgressProxy, verifyAdminEgressProxyInspect,
} from "./adminEgressProxy.js";
import { adminSessionNetworkName, adminSessionNetworkLabels } from "./adminSessionNetwork.js";
const sid = "sess_11111111-1111-4111-8111-111111111111";
const name = adminEgressProxyName(sid);
const image = `sha256:${"a".repeat(64)}`;
const network = adminSessionNetworkName(sid);
const config = {
  ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY: "per-session-controlled-egress",
  ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK: "false",
  ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "development",
  ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK: "PROXY_LIFECYCLE_TEST_ONLY",
  ZOESKOUL_LEARNING_ADMIN_EGRESS_PROXY_IMAGE: image,
};
const cidr = "172.25.0.0/16";
const gatewayLabels = {"com.zoeskoul.learning.egress-proxy":"v1", "com.zoeskoul.learning.egress-gateway-phase":"2c3-development-audit-only"};
const labInspect = () => ({Name:network,Driver:"bridge",Internal:true,EnableIPv6:false,Attachable:false,
  Labels:adminSessionNetworkLabels(sid),Containers:{},IPAM:{Config:[{Subnet:cidr}]}});
const bridgeInspect = () => ({Name:"bridge",Driver:"bridge",Internal:false,EnableIPv6:false,
  IPAM:{Config:[{Subnet:"172.17.0.0/16"}]}});
function networkClient(lab:unknown=labInspect(), bridge:unknown=bridgeInspect(), connect=vi.fn()) {
  return {getNetwork:(n:string)=>({inspect:async()=>n === network ? lab : bridge,connect})};
}
const inspect = () => ({
  Name: `/${name}`, Image: image,
  Config: {User:"1000:1000", Labels:adminEgressProxyLabels(sid),Env:[`LAB_CLIENT_CIDR=${cidr}`]},
  HostConfig: {NetworkMode:"bridge", Privileged:false, ReadonlyRootfs:true,
    CapDrop:["ALL"], SecurityOpt:["no-new-privileges:true"],
    Memory:64*1024*1024,MemorySwap:64*1024*1024,PidsLimit:32},
  State: {Running:true, Health:{Status:"healthy"}},
  NetworkSettings: {Networks:{bridge:{},[network]:{}}},
});
const missing = () => Promise.reject(Object.assign(new Error("not found"), {statusCode:404}));
describe("phase2c4 supervised gateway contract and proxy lifecycle", () => {
  it("is opt-in and forbids production and unfiltered egress", () => {
    expect(adminEgressConfig({})).toBeNull();
    expect(adminEgressConfig(config)).toEqual({image});
    for (const [key,value] of Object.entries({
      ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE:"production",
      ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK:"true",
      ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK:"wrong",
      ZOESKOUL_LEARNING_ADMIN_EGRESS_PROXY_IMAGE:"latest",
    })) {
      expect(() => adminEgressConfig({...config,[key]:value})).toThrow();
    }
  });
  it("requires unique session name and immutable owner identity", () => {
    expect(() => adminEgressProxyName("wrong")).toThrow();
    expect(() => verifyAdminEgressProxyInspect({...inspect(), Config:{User:"0:0",Labels:adminEgressProxyLabels(sid)}},sid,image)).toThrow();
    expect(() => verifyAdminEgressProxyInspect({...inspect(),HostConfig:{...inspect().HostConfig,Privileged:true}},sid,image)).toThrow();
    expect(() => verifyAdminEgressProxyInspect(inspect(),sid,image)).not.toThrow();
  });
  it("starts only a labeled pinned healthy proxy on bridge plus its own internal network", async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const connect = vi.fn().mockResolvedValue(undefined);
    const createContainer = vi.fn().mockResolvedValue({id:"cid",start,inspect:async()=>inspect(),remove:vi.fn()});
    const client={
      getImage:()=>({inspect:async()=>({Id:image,Config:{User:"1000:1000",Labels:gatewayLabels}})}),
      createContainer, ...networkClient(labInspect(),bridgeInspect(),connect),
    };
    await expect(createAdminEgressProxy(sid,network,image,client as any)).resolves.toBe(name);
    expect(createContainer).toHaveBeenCalledWith(expect.objectContaining({
      Image:image,User:"1000:1000",Env:expect.arrayContaining([`LAB_CLIENT_CIDR=${cidr}`]), HostConfig:expect.objectContaining({
        NetworkMode:"bridge", CapDrop:["ALL"], ReadonlyRootfs:true,
        PidsLimit:32, Memory:64*1024*1024,
      }),
    }));
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({Container:"cid"}));
    expect(start).toHaveBeenCalledTimes(1);
  });
  it("refuses an unverified proxy image before creating a container",async()=>{
    const createContainer=vi.fn();
    const client={getImage:()=>({inspect:async()=>({Id:image,Config:{User:"0:0",Labels:{}}})}),createContainer};
    await expect(createAdminEgressProxy(sid,network,image,client as any)).rejects.toThrow("Untrusted");
    expect(createContainer).not.toHaveBeenCalled();
  });
  it("rejects unexpected extra networks and removes its failed start",async()=>{
    const remove=vi.fn().mockResolvedValue(undefined);
    const client={
      getImage:()=>({inspect:async()=>({Id:image,Config:{User:"1000:1000",Labels:gatewayLabels}})}),
      createContainer:async()=>({id:"cid",start:async()=>{},inspect:async()=>({
        ...inspect(),NetworkSettings:{Networks:{...inspect().NetworkSettings.Networks,unexpected:{}}},
      }),remove}),
      ...networkClient(),
    };
    await expect(createAdminEgressProxy(sid,network,image,client as any)).rejects.toThrow("unexpected network");
    expect(remove).toHaveBeenCalledWith({force:true});
  });
  it("derives the only approved client CIDR from the verified session network",async()=>{
    await expect(verifiedAdminGatewayCIDR(sid,network,networkClient() as any)).resolves.toBe(cidr);
    await expect(verifiedAdminGatewayCIDR(sid,"bridge",networkClient() as any)).rejects.toThrow("owner");
    const invalid = ["172.25.1.0/16","8.8.8.0/24","100.64.0.0/16","172.25.0.0/15","172.25.0.0/29","172.25.0.0/33","172.025.0.0/16","fd00::/64"];
    for (const subnet of invalid) {
      const lab={...labInspect(),IPAM:{Config:[{Subnet:subnet}]}};
      await expect(verifiedAdminGatewayCIDR(sid,network,networkClient(lab) as any)).rejects.toThrow();
    }
  });
  it("derives distinct CIDRs for two separately owned session networks",async()=>{
    const other = "sess_22222222-2222-4222-8222-222222222222";
    const otherNetwork = adminSessionNetworkName(other);
    const otherLab = {...labInspect(),Name:otherNetwork,Labels:adminSessionNetworkLabels(other),IPAM:{Config:[{Subnet:"172.26.0.0/16"}]}};
    const client = {getNetwork:(n:string)=>({inspect:async()=>n === network ? labInspect() : n === otherNetwork ? otherLab : bridgeInspect()})};
    await expect(verifiedAdminGatewayCIDR(sid,network,client as any)).resolves.toBe(cidr);
    await expect(verifiedAdminGatewayCIDR(other,otherNetwork,client as any)).resolves.toBe("172.26.0.0/16");
    await expect(verifiedAdminGatewayCIDR(sid,otherNetwork,client as any)).rejects.toThrow("owner");
  });
  it("rejects missing or ambiguous IPAM, foreign owners and existing endpoints",async()=>{
    for (const lab of [
      {...labInspect(),IPAM:{Config:[]}},
      {...labInspect(),IPAM:{Config:[{Subnet:cidr},{Subnet:"172.26.0.0/16"}]}},
      {...labInspect(),Labels:{}}, {...labInspect(),Internal:false},
      {...labInspect(),Containers:{foreign:{}}},
    ]) {
      await expect(verifiedAdminGatewayCIDR(sid,network,networkClient(lab) as any)).rejects.toThrow();
    }
  });
  it("rejects overlapping bridge CIDRs and unverified outbound network",async()=>{
    for (const bridge of [
      {...bridgeInspect(),IPAM:{Config:[{Subnet:"172.25.128.0/17"}]}},
      {...bridgeInspect(),IPAM:{Config:[{Subnet:"172.24.0.0/15"}]}},
      {...bridgeInspect(),EnableIPv6:true}, {...bridgeInspect(),Internal:true},
    ]) {
      await expect(verifiedAdminGatewayCIDR(sid,network,networkClient(labInspect(),bridge) as any)).rejects.toThrow();
    }
  });
  it("refuses the legacy canary image and invalid subnet before creating the gateway",async()=>{
    const createContainer=vi.fn();
    const getImage=()=>({inspect:async()=>({Id:image,Config:{User:"1000:1000",Labels:gatewayLabels}})});
    await expect(createAdminEgressProxy(sid,network,image,{
      createContainer,getImage:()=>({inspect:async()=>({Id:image,Config:{User:"1000:1000",Labels:{"com.zoeskoul.learning.egress-proxy":"v1"}}})}),
      ...networkClient(),
    } as any)).rejects.toThrow("Untrusted");
    await expect(createAdminEgressProxy(sid,network,image,{
      createContainer,getImage,...networkClient({...labInspect(),Labels:{}}),
    } as any)).rejects.toThrow();
    expect(createContainer).not.toHaveBeenCalled();
  });
  it("rejects missing or duplicated gateway CIDR at readiness and removes failed start",async()=>{
    for (const Env of [[],[`LAB_CLIENT_CIDR=${cidr}`,`LAB_CLIENT_CIDR=172.26.0.0/16`],["LAB_CLIENT_CIDR=172.26.0.0/16"]]) {
      const remove=vi.fn().mockResolvedValue(undefined);
      const client={
        getImage:()=>({inspect:async()=>({Id:image,Config:{User:"1000:1000",Labels:gatewayLabels}})}),
        createContainer:async()=>({id:"cid",start:async()=>{},inspect:async()=>({...inspect(),Config:{...inspect().Config,Env}}),remove}),
        ...networkClient(),
      };
      await expect(createAdminEgressProxy(sid,network,image,client as any)).rejects.toThrow("CIDR environment mismatch");
      expect(remove).toHaveBeenCalledWith({force:true});
    }
  });
  it("removes only verified owner and requires independent absence",async()=>{
    const remove=vi.fn().mockResolvedValue(undefined);
    const inspector=vi.fn().mockResolvedValueOnce(inspect()).mockImplementation(missing);
    const client={getContainer:()=>({inspect:inspector,remove})};
    await expect(removeAdminEgressProxy("other",sid,client as any)).rejects.toThrow("Wrong proxy");
    await removeAdminEgressProxy(name,sid,client as any);
    expect(remove).toHaveBeenCalledWith({force:true});
  });
  it("fails closed when removal returned success but proxy remains",async()=>{
    const client={getContainer:()=>({inspect:async()=>inspect(),remove:async()=>{}})};
    await expect(removeAdminEgressProxy(name,sid,client as any)).rejects.toThrow("remains");
  });
});
