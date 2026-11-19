import { describe,expect,it,vi } from "vitest";
import { SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { executeOwnedTanstackDevelopmentMutation } from "./tanstackDevelopmentApplicationMutation.js";
import type { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";
const ownerKey="u:"+"a".repeat(64),buildProjectId="project_test",previewId="preview_123e4567-e89b-42d3-a456-426614174000";
const basePath=`/api/build/projects/${buildProjectId}/preview/${previewId}/content/${"C".repeat(32)}/`;
const path="_serverFn/"+Buffer.from(JSON.stringify({file:"/src/functions/mutate.ts?tss-serverfn-split",export:"mutate_handler"})).toString("base64url");
const args={ownerKey,buildProjectId,previewId,sourceVersion:7,path,bodyBase64:"e30="};
const reply={status:200,headers:{"content-type":"application/json","x-tss-serialized":"true"},bodyBase64:"e30="};
function fixture(){
 const registry=new SharedFullStackPreviewRegistry(), close=vi.fn(async()=>{});
 registry.register({id:previewId,mode:"development",ownerKey,buildProjectId,sourceVersion:7,
   identity:{fingerprint:"f".repeat(64),sourceFingerprint:"a".repeat(64),dependencyFingerprint:"b".repeat(64),runtimeImageId:"sha256:"+"c".repeat(64)} as any,
   containerId:"container",basePath,createdAt:Date.now(),lastActivityAt:Date.now(),close});
 const transport=vi.fn(async(_cid:string,_request:unknown)=>reply);
 const deps={registry,transport:transport as unknown as typeof fetchTanstackHttpInsideSandbox};
 return {registry,close,transport,deps};
}
describe("H10P3A mutation revision fence",()=>{
 it("rejects invalid identity and malformed input before dispatch without quarantine",async()=>{
  const f=fixture();for(const over of [{ownerKey:"foreign"},{sourceVersion:8},{bodyBase64:""},{path:path+"?payload=e30="}])
   await expect(executeOwnedTanstackDevelopmentMutation({...args,...over},f.deps)).rejects.toThrow();
  expect(f.transport).not.toHaveBeenCalled();expect(f.close).not.toHaveBeenCalled();expect(f.registry.get(previewId)).not.toBeNull();
 });
 it("holds the update slot until the single validated response finishes",async()=>{
  const f=fixture();let release!:()=>void;let entered!:()=>void;const ready=new Promise<void>(r=>{entered=r;});const wait=new Promise<void>(r=>{release=r;});
  f.transport.mockImplementationOnce(async()=>{entered();await wait;return reply;});
  const mutation=executeOwnedTanstackDevelopmentMutation(args,f.deps);await ready;
  expect(f.registry.developmentUpdatePending(previewId)).toBe(true);
  await expect(executeOwnedTanstackDevelopmentMutation(args,f.deps)).rejects.toThrow();
  let didUpdate=false;const update=f.registry.withDevelopmentUpdate(previewId,async()=>{didUpdate=true;});
  expect(didUpdate).toBe(false);release();expect((await mutation).response.bodyBase64).toBe(reply.bodyBase64);await update;
  expect(didUpdate).toBe(true);expect(f.transport).toHaveBeenCalledTimes(1);expect(f.close).not.toHaveBeenCalled();
 });
 it("quarantines and retires uncertain mutations, including failed cleanup",async()=>{
  const f=fixture();f.transport.mockRejectedValueOnce(new Error("timeout"));f.close.mockRejectedValueOnce(Error("cleanup"));
  await expect(executeOwnedTanstackDevelopmentMutation(args,f.deps)).rejects.toThrow("outcome uncertain");
  expect(f.transport).toHaveBeenCalledTimes(1);expect(f.close).toHaveBeenCalledTimes(1);
  expect(f.registry.get(previewId)?.basePath).toMatch(/^\/quarantined\//);
  await expect(executeOwnedTanstackDevelopmentMutation(args,f.deps)).rejects.toThrow();expect(f.transport).toHaveBeenCalledTimes(1);
 });
 it("rejects private capability-bearing responses and retires the lease",async()=>{
  const f=fixture();f.transport.mockResolvedValueOnce({...reply,bodyBase64:Buffer.from(JSON.stringify({url:basePath})).toString("base64")});
  await expect(executeOwnedTanstackDevelopmentMutation(args,f.deps)).rejects.toThrow("outcome uncertain");
  expect(f.registry.get(previewId)).toBeNull();expect(f.close).toHaveBeenCalledTimes(1);
 });
});
