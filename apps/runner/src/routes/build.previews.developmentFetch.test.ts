import {describe,expect,it,vi} from "vitest";
import { randomUUID } from "node:crypto";
import {makeTanstackDevelopmentFetchRoute} from "./build.previews.developmentFetch.js";
import { DevelopmentPreviewRevisionTransitionError } from "../services/build/sharedPreviewRegistry.js";
const previewId="preview_"+randomUUID();
const actorKey="u:"+"a".repeat(64);
function routeCase(enabled=true, applicationRpcEnabled=false, applicationMutationEnabled=false) {
 const read=vi.fn(async (_input:unknown)=>({sourceVersion:7,
   response:{status:200,headers:{"content-type":"text/html"},bodyBase64:"PGh0bWw+PC9odG1sPg=="}}));
 const mutate=vi.fn(async (_input:unknown)=>({sourceVersion:7,response:{status:200,headers:{"content-type":"application/json"},bodyBase64:"e30=",upstreamDurationMs:null}}));
 const deps={enabled:()=>enabled, applicationRpcEnabled:()=>applicationRpcEnabled, applicationMutationEnabled:()=>applicationMutationEnabled, actorKey:()=>actorKey, read, mutate};
 const handle=makeTanstackDevelopmentFetchRoute(deps);
 const request={params:{previewId},body:{buildProjectId:"project_test",sourceVersion:7,
   path:"index.html",
   method:"GET",accept:"*/*"}};
 const invoke=async(req:unknown=request)=>{
   let status=200;let result:unknown=null;
   const res={status(n:number){status=n;return this;},json(b:unknown){result=b;return this;}};
   await handle(req as never,res as never,()=>{});
   return {status,result};
 };
 return {read,mutate,request,invoke};
}
describe("Phase 4E2 private Runner development read HTTP gate",()=>{
 it("is absent until explicitly enabled",async()=>{
  const f=routeCase(false);expect((await f.invoke()).status).toBe(404);expect(f.read).not.toHaveBeenCalled();
 });
 it("forwards only exact validated read identity and read-only method",async()=>{
  const f=routeCase();
  expect((await f.invoke()).status).toBe(200);
  expect(f.read).toHaveBeenCalledWith(expect.objectContaining({ownerKey:actorKey,previewId,
    buildProjectId:"project_test",sourceVersion:7,method:"GET",accept:"*/*"}));
 });
 it("rejects arbitrary input fields, invalid versions, methods and actor identities",async()=>{
  const f=routeCase();
  for(const body of [
   {...f.request.body,method:"POST"},{...f.request.body,method:"WS"},
   {...f.request.body,sourceVersion:"7"},{...f.request.body,sourceVersion:1.5},
   {...f.request.body,extra:"credential"},{...f.request.body,accept:"application/json"},
   {...f.request.body,path:"x".repeat(4097)},
   {...f.request.body,path:"/api/build/projects/project_test/preview/private"},
   {...f.request.body,path:"../escape"},
   {...f.request.body,path:"%2fother"},
   {...f.request.body,path:"@fs/etc/passwd"},
  ]) expect((await f.invoke({...f.request,body})).status).toBe(400);
  expect(f.read).not.toHaveBeenCalled();
 });
 it("fails closed without exposing error details",async()=>{
  const f=routeCase();f.read.mockRejectedValueOnce(new Error("internal Docker secret"));
  const r=await f.invoke();expect(r.status).toBe(404);
  expect(JSON.stringify(r.result)).not.toContain("secret");
 });
});


describe("Phase 4F5H10P private typed read fence",()=>{
 it("distinguishes the typed transition without exposing lease detail",async()=>{
  const f=routeCase();
  f.read.mockRejectedValueOnce(new DevelopmentPreviewRevisionTransitionError());
  expect(await f.invoke()).toEqual({status:409,result:{ok:false,code:"REVISION_TRANSITION"}});
 });
 it("does not treat a matching error message as a typed transition",async()=>{
  const f=routeCase();f.read.mockRejectedValueOnce(new Error("Preview not found."));
  expect(await f.invoke()).toEqual({status:404,result:{ok:false,code:"NOT_FOUND"}});
 });
});


describe("private application RPC remains explicitly gated",()=>{
 it("denies even a valid RPC mode when not enabled",async()=>{
  const f=routeCase();
  const id=Buffer.from(JSON.stringify({file:"/src/functions/siteInfo.functions.ts?tss-serverfn-split",export:"getSiteInfo_createServerFn_handler"})).toString("base64url");
  expect((await f.invoke({...f.request,body:{...f.request.body,path:"_serverFn/"+id,applicationRpc:"tanstack-json-get-v1"}})).status).toBe(404);
  expect(f.read).not.toHaveBeenCalled();
 });
});

describe("private application RPC admission",()=>{
 const id=Buffer.from(JSON.stringify({file:"/src/functions/siteInfo.functions.ts?tss-serverfn-split",export:"getSiteInfo_createServerFn_handler"})).toString("base64url");
 it("passes only the exact internal GET protocol to the owner-bound service",async()=>{
  const f=routeCase(true,true);
  const body={...f.request.body,path:"_serverFn/"+id,applicationRpc:"tanstack-json-get-v1"};
  expect((await f.invoke({...f.request,body})).status).toBe(200);
  expect(f.read).toHaveBeenCalledWith(expect.objectContaining({ownerKey:actorKey,method:"GET",applicationRpc:"tanstack-json-get-v1"}));
  f.read.mockClear();
  for(const override of [{method:"POST"},{path:"src/index.tsx"},{headers:{origin:"null"}},{accept:"text/css"}])
   expect((await f.invoke({...f.request,body:{...body,...override}})).status).toBe(400);
  expect(f.read).not.toHaveBeenCalled();
 });
});


describe("H10P3A private mutation admission",()=>{
 const id=Buffer.from(JSON.stringify({file:"/src/functions/mutate.ts?tss-serverfn-split",export:"mutate_handler"})).toString("base64url");
 it("requires both independent gates and never uses the read service",async()=>{
  for(const flags of [[false,true],[true,false],[true,true]]){
   const f=routeCase(true,flags[0],flags[1]);
   const body={...f.request.body,method:"POST",path:"_serverFn/"+id,applicationRpc:"tanstack-json-post-v1",bodyBase64:"e30="};
   const allowed=flags.every(Boolean);expect((await f.invoke({...f.request,body})).status).toBe(allowed?200:404);
   expect(f.read).not.toHaveBeenCalled();expect(f.mutate).toHaveBeenCalledTimes(allowed?1:0);
   if(allowed)expect(f.mutate).toHaveBeenCalledExactlyOnceWith({ownerKey:actorKey,previewId,buildProjectId:"project_test",sourceVersion:7,path:body.path,bodyBase64:"e30="});
  }
 });
 it("rejects wrong method, query, extra keys and malformed body before execution",async()=>{
  const f=routeCase(true,true,true);
  const body={...f.request.body,method:"POST",path:"_serverFn/"+id,applicationRpc:"tanstack-json-post-v1",bodyBase64:"e30="};
  for(const over of [{method:"GET"},{path:body.path+"?payload=e30="},{bodyBase64:""},{bodyBase64:"YWJj"},{headers:{authorization:"bad"}},{mutationDeadlineMs:Date.now()+10000}])
   expect((await f.invoke({...f.request,body:{...body,...over}})).status).toBe(400);
  expect(f.mutate).not.toHaveBeenCalled();expect(f.read).not.toHaveBeenCalled();
 });
});
