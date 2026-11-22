import {afterEach,describe,expect,it,vi} from "vitest";
import {createDevelopmentPreviewBrowserSession} from "./reactPreviewDevelopmentBrowserSession";
const previewId="preview_11111111-1111-4111-8111-111111111111";
const root="/api/build/projects/project_1/preview";
const token="dpg1."+"a".repeat(43);
const url=`${root}/${previewId}/development/content/${token}/`;
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"content-type":"application/json"}});
afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E3C4B2 browser durable grant renewal",()=>{
 it("retains exact iframe URL on consecutive saves and renewals",async()=>{
  let now=1000;let saved=7;let renewals=0;
  const fetchClient=vi.fn(async(path:string,init:RequestInit)=>{
   if(path.endsWith("/development/start"))return json({ok:true,previewId,sourceVersion:7});
   if(path.endsWith("/development/read-access"))return json({ok:true,documentUrl:url,basePath:url,sourceVersion:7});
   if(path.endsWith("/development/update")){saved++;return json({ok:true,action:"updated",sourceVersion:saved});}
   if(path.endsWith("/development/renew-access")){
    const body=JSON.parse(String(init.body));expect(body).toEqual({sourceVersion:saved,grantToken:token});
    renewals++;return json({ok:true,sourceVersion:saved});
   }
   throw Error("unexpected request: "+path);
  });
  const session=createDevelopmentPreviewBrowserSession({buildProjectId:"project_1",fetchClient,now:()=>now});
  const initial=await session.start(7);
  for(const version of [8,9,10]) {
   now+=5000;expect((await session.update(version)).documentUrl).toBe(initial.documentUrl);
   expect(session.snapshot()?.sourceVersion).toBe(version);
  }
  now+=60_000;expect(session.renewalDue()).toBe(true);
  const renewed=await session.renew();
  expect(renewed.documentUrl).toBe(initial.documentUrl);
  expect(renewals).toBe(4);
  expect(fetchClient.mock.calls.filter(([path])=>path.endsWith("/development/read-access"))).toHaveLength(1);
 });
 it("fails closed on expiry, refused renewal or stale source without reissuing a URL",async()=>{
  let calls=0;
  const fetchClient=vi.fn(async(path:string)=>{
   calls++;
   if(path.endsWith("/development/start"))return json({ok:true,previewId,sourceVersion:7});
   if(path.endsWith("/development/read-access"))return json({ok:true,documentUrl:url,basePath:url,sourceVersion:7});
   if(path.endsWith("/development/update"))return json({ok:true,action:"updated",sourceVersion:8});
   return json({ok:false,code:"BUILD_PREVIEW_UNAVAILABLE"},404);
  });
  const session=createDevelopmentPreviewBrowserSession({buildProjectId:"project_1",fetchClient});
  await session.start(7);
  await expect(session.update(8)).rejects.toMatchObject({code:"UNAVAILABLE"});
  expect(session.snapshot()).toBeNull();
  expect(calls).toBe(4);
 });
});
