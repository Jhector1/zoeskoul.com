import {describe,expect,it,vi} from "vitest";
import { randomUUID } from "node:crypto";
import {makeTanstackDevelopmentFetchRoute} from "./build.previews.developmentFetch.js";
const previewId="preview_"+randomUUID();
const actorKey="u:"+"a".repeat(64);
function routeCase(enabled=true) {
 const read=vi.fn(async (_input:unknown)=>({sourceVersion:7,
   response:{status:200,headers:{"content-type":"text/html"},bodyBase64:"PGh0bWw+PC9odG1sPg=="}}));
 const deps={enabled:()=>enabled, actorKey:()=>actorKey, read};
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
 return {read,request,invoke};
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
