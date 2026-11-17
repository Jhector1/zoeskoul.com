import {describe, expect, it, vi} from "vitest";
import {
  adminEgressConfig, adminEgressProxyName, adminEgressProxyLabels,
  createAdminEgressProxy, removeAdminEgressProxy, verifyAdminEgressProxyInspect,
} from "./adminEgressProxy.js";
import { adminSessionNetworkName } from "./adminSessionNetwork.js";
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
const inspect = () => ({
  Name: `/${name}`, Image: image,
  Config: {User:"1000:1000", Labels:adminEgressProxyLabels(sid)},
  HostConfig: {NetworkMode:"bridge", Privileged:false, ReadonlyRootfs:true,
    CapDrop:["ALL"], SecurityOpt:["no-new-privileges:true"],
    Memory:64*1024*1024,MemorySwap:64*1024*1024,PidsLimit:32},
  State: {Running:true, Health:{Status:"healthy"}},
  NetworkSettings: {Networks:{bridge:{},[network]:{}}},
});
const missing = () => Promise.reject(Object.assign(new Error("not found"), {statusCode:404}));
describe("phase2c2 supervised egress proxy lifecycle", () => {
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
      getImage:()=>({inspect:async()=>({Id:image,Config:{User:"1000:1000",Labels:{"com.zoeskoul.learning.egress-proxy":"v1"}}})}),
      createContainer, getNetwork:()=>({connect}),
    };
    await expect(createAdminEgressProxy(sid,network,image,client as any)).resolves.toBe(name);
    expect(createContainer).toHaveBeenCalledWith(expect.objectContaining({
      Image:image,User:"1000:1000", HostConfig:expect.objectContaining({
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
      getImage:()=>({inspect:async()=>({Id:image,Config:{User:"1000:1000",Labels:{"com.zoeskoul.learning.egress-proxy":"v1"}}})}),
      createContainer:async()=>({id:"cid",start:async()=>{},inspect:async()=>({
        ...inspect(),NetworkSettings:{Networks:{...inspect().NetworkSettings.Networks,unexpected:{}}},
      }),remove}),
      getNetwork:()=>({connect:async()=>{}}),
    };
    await expect(createAdminEgressProxy(sid,network,image,client as any)).rejects.toThrow("unexpected network");
    expect(remove).toHaveBeenCalledWith({force:true});
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
