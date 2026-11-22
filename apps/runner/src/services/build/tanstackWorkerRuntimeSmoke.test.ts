import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TanstackWorkerArtifactV1 } from "@zoeskoul/build-executor-contracts";
const m=vi.hoisted(()=>({create:vi.fn(),start:vi.fn(),remove:vi.fn(),inspect:vi.fn(),fetch:vi.fn(),probe:vi.fn(),retire:vi.fn(),read:vi.fn()}));
vi.mock("../docker/dockerClient.js",()=>({docker:{createContainer:m.create}}));
vi.mock("./executeProductionBuild.js",()=>({buildProductionBuildContainerOptions:({command}: {command:readonly string[]})=>({
  Image:"fixture", Cmd:[...command], Env:["RUNNER_EXEC_MODE=oneshot"], User:"1000:0", Labels:{},
  HostConfig:{Binds:[],NetworkMode:"none",Privileged:false,ReadonlyRootfs:true,CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],Memory:1024,MemorySwap:1024,CpuQuota:100000,CpuPeriod:100000,PidsLimit:64,Tmpfs:{"/tmp":"rw,noexec,nosuid,size=256m"}},
})}));
vi.mock("./tanstackPreviewDockerTransport.js",()=>({fetchTanstackHttpInsideSandbox:m.fetch,probeTanstackListenerInsideSandbox:m.probe,retireTanstackHttpWorker:m.retire}));
vi.mock("./tanstackWorkerArtifact.js",()=>({readTanstackWorkerArtifact:m.read}));
import { runTanstackWorkerRuntimeSmoke, workerSmokeContainerOptions } from "./tanstackWorkerRuntimeSmoke.js";
const b64=(s:string)=>Buffer.from(s).toString("base64");
const artifact:TanstackWorkerArtifactV1={type:"worker-bundle",serverOutputPath:"dist/server",assetsOutputPath:"dist/client",entrypoint:"index.js",sha256:"a".repeat(64),totalBytes:1,
 files:[{path:"server/wrangler.json",encoding:"base64",data:b64(JSON.stringify({main:"index.js",compatibility_date:"2026-10-01",compatibility_flags:["nodejs_compat"],assets:{directory:"../client"}}))},
 {path:"client/assets/app.js",encoding:"base64",data:b64("js")},{path:"client/assets/app.css",encoding:"base64",data:b64("css")}]};
const run=()=>{const onContainerCreated=vi.fn(async()=>{}),onContainerRemoved=vi.fn(async()=>{});
 return {onContainerCreated,onContainerRemoved,promise:runTanstackWorkerRuntimeSmoke({workspaceDir:"/workspaces/fixture",artifact,runId:"run",onContainerCreated,onContainerRemoved})};};
const reply=(body:string,type:string,status=200)=>({status,headers:{"content-type":type},bodyBase64:b64(body)});
beforeEach(()=>{
 vi.resetAllMocks();m.create.mockResolvedValue({id:"container",start:m.start,remove:m.remove,inspect:m.inspect});
 m.start.mockResolvedValue(undefined);m.remove.mockResolvedValue(undefined);m.probe.mockResolvedValue(true);m.retire.mockResolvedValue(undefined);m.read.mockResolvedValue(artifact);
 m.fetch.mockImplementation(async (_id:string,request:{path:string})=>{
  switch(request.path){case "/":return reply('<html><head><link href="/assets/app.css"></head><body><script src="/assets/app.js"></script></body></html>',"text/html");
  case "/api/health":return reply('{"ok":true,"service":"generated-application"}',"application/json");
  case "/assets/app.js":return reply("js","text/javascript");case "/assets/app.css":return reply("css","text/css");default:throw new Error("unexpected request");}
 });
});
describe("U18 runtime smoke orchestration",()=>{
 it("uses a read-only workspace, no network or port bindings",()=>{
  const o=workerSmokeContainerOptions("/workspaces/fixture",artifact,"run");
  expect(o.HostConfig).toMatchObject({Binds:["/workspaces/fixture:/workspace:ro"],NetworkMode:"none",Privileged:false,ReadonlyRootfs:true,CapDrop:["ALL"]});
  expect(o.HostConfig).not.toHaveProperty("PortBindings");
 });
 it("disables local log compression for the single-file bounded log configuration",()=>{
  const o=workerSmokeContainerOptions("/workspaces/fixture",artifact,"run");
  expect(o.HostConfig.LogConfig).toEqual({Type:"local",Config:{"max-size":"1m","max-file":"1","compress":"false"}});
 });
 it("reports Docker start rejection and releases the registered container before attesting",async()=>{
  m.start.mockRejectedValue(new Error("failed to initialize logging driver"));
  const {promise,onContainerCreated,onContainerRemoved}=run();
  await expect(promise).resolves.toEqual({state:"failed",stage:"startup",artifactSha256:artifact.sha256});
  expect(onContainerCreated).toHaveBeenCalledWith("container");
  expect(onContainerCreated.mock.invocationCallOrder[0]).toBeLessThan(m.start.mock.invocationCallOrder[0]!);
  expect(m.probe).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
  expect(m.remove).toHaveBeenCalledWith({force:true});
  expect(m.remove.mock.invocationCallOrder[0]).toBeLessThan(m.retire.mock.invocationCallOrder[0]!);
  expect(m.retire.mock.invocationCallOrder[0]).toBeLessThan(onContainerRemoved.mock.invocationCallOrder[0]!);
  expect(onContainerRemoved.mock.invocationCallOrder[0]).toBeLessThan(m.read.mock.invocationCallOrder[0]!);
 });
 it("checks SSR, health and exact served assets then removes the container before attesting",async()=>{
  const {promise,onContainerCreated,onContainerRemoved}=run();
  await expect(promise).resolves.toEqual({state:"passed",artifactSha256:artifact.sha256,homeStatus:200,healthStatus:200,verifiedClientAssets:2});
  expect(m.fetch.mock.calls.map(c=>c[1].path)).toEqual(["/","/api/health","/assets/app.js","/assets/app.css"]);
  expect(onContainerCreated).toHaveBeenCalledWith("container");
  expect(m.remove).toHaveBeenCalledWith({force:true});
  expect(m.remove.mock.invocationCallOrder[0]).toBeLessThan(onContainerRemoved.mock.invocationCallOrder[0]!);
  expect(m.remove.mock.invocationCallOrder[0]).toBeLessThan(m.read.mock.invocationCallOrder[0]!);
 });
 it("reports asset corruption instead of a runtime pass",async()=>{
  m.fetch.mockImplementationOnce(async()=>reply('<html><head><link href="/assets/app.css"></head><body><script src="/assets/app.js"></script></body></html>',"text/html"))
   .mockImplementationOnce(async()=>reply('{"ok":true,"service":"generated-application"}',"application/json"))
   .mockImplementationOnce(async()=>reply("wrong","text/javascript"));
  await expect(run().promise).resolves.toMatchObject({state:"failed",stage:"client-assets"});
  expect(m.remove).toHaveBeenCalledTimes(1);
 });
 it("does not attest when container removal fails",async()=>{
  m.remove.mockRejectedValue(new Error("remove failed"));const {promise,onContainerRemoved}=run();
  await expect(promise).rejects.toThrow();expect(onContainerRemoved).not.toHaveBeenCalled();expect(m.read).not.toHaveBeenCalled();
 });
 it("does not attest if artifact bytes change during execution",async()=>{
  m.read.mockResolvedValue({...artifact,sha256:"b".repeat(64)});
  await expect(run().promise).rejects.toThrow(/artifact changed/);
 });
});
