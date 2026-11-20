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
 it("retains exact iframe URL on consecutive and skipped saves and renewals",async()=>{
  let now=1000;let saved=7;let renewals=0;
  const fetchClient=vi.fn(async(path:string,init:RequestInit)=>{
   if(path.endsWith("/development/start"))return json({ok:true,previewId,sourceVersion:7});
   if(path.endsWith("/development/read-access"))return json({ok:true,documentUrl:url,basePath:url,sourceVersion:7});
   if(path.endsWith("/development/update")){saved=JSON.parse(String(init.body)).sourceVersion;return json({ok:true,action:"updated",sourceVersion:saved});}
   if(path.endsWith("/development/renew-access")){
    const body=JSON.parse(String(init.body));expect(body).toEqual({sourceVersion:saved,grantToken:token});
    renewals++;return json({ok:true,sourceVersion:saved});
   }
   throw Error("unexpected request: "+path);
  });
  const session=createDevelopmentPreviewBrowserSession({buildProjectId:"project_1",fetchClient,now:()=>now});
  const initial=await session.start(7);
  for(const version of [8,11,12]) {
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


describe("H10R1 exact durable revision reconciliation",()=>{
 function fixture(mode:"lost"|"unavailable"|"renew-outage"|"conflict"|"denied", reconcile=true){
  const replacement="preview_22222222-2222-4222-8222-222222222222";
  const replacementUrl=`${root}/${replacement}/development/content/${token}/`;
  let starts=0,updates=0,renewals=0;
  const fetchClient=vi.fn(async(path:string,init:RequestInit)=>{
   const version=JSON.parse(String(init.body)).sourceVersion;
   if(path.endsWith("/development/start")){starts++;return json({ok:true,previewId:starts===1?previewId:replacement,sourceVersion:version});}
   if(path.endsWith("/development/read-access")){const documentUrl=starts===1?url:replacementUrl;return json({ok:true,documentUrl,basePath:documentUrl,sourceVersion:version});}
   if(path.endsWith("/development/update")){
    updates++;
    if(mode==="lost")throw Error("connection reset");
    if(mode==="unavailable")return json({ok:false},503);
    if(mode==="conflict")return json({ok:false},409);
    if(mode==="denied")return json({ok:false},403);
    return json({ok:true,action:"updated",sourceVersion:version});
   }
   if(path.endsWith("/development/renew-access")){
    renewals++;
    expect(JSON.parse(String(init.body))).toEqual({sourceVersion:version,grantToken:token});
    if(mode==="renew-outage" && renewals===1)return json({ok:false},503);
    return reconcile?json({ok:true,sourceVersion:version}):json({ok:false},404);
   }
   throw Error("unexpected path");
  });
  return {session:createDevelopmentPreviewBrowserSession({buildProjectId:"project_1",fetchClient}),counts:()=>({starts,updates,renewals}),replacementUrl};
 }
 for(const mode of ["lost","unavailable","renew-outage"] as const){
  it(`reconciles ${mode} once without replaying workspace mutation`,async()=>{
   const {session,counts}=fixture(mode);await session.start(7);
   await expect(session.update(8)).rejects.toMatchObject({code:"UNAVAILABLE"});
   expect(session.snapshot()).toBeNull();
   expect(await session.restart(8)).toMatchObject({previewId,sourceVersion:8,documentUrl:url});
   expect(counts()).toEqual({starts:1,updates:1,renewals:mode==="renew-outage"?2:1});
  });
 }
 it("uses independent admission if proof fails; never reinstates old grant",async()=>{
  const {session,counts,replacementUrl}=fixture("lost",false);await session.start(7);
  await expect(session.update(8)).rejects.toThrow();
  expect((await session.restart(8)).documentUrl).toBe(replacementUrl);
  expect(counts()).toEqual({starts:2,updates:1,renewals:1});
 });
 for(const mode of ["conflict","denied"] as const){
  it(`does not reconcile a definitive ${mode} response`,async()=>{
   const {session,counts,replacementUrl}=fixture(mode);await session.start(7);
   await expect(session.update(8)).rejects.toThrow();
   expect((await session.restart(8)).documentUrl).toBe(replacementUrl);
   expect(counts()).toEqual({starts:2,updates:1,renewals:0});
  });
 }
 it("never uses a candidate for a different revision",async()=>{
  const {session,counts,replacementUrl}=fixture("lost");await session.start(7);
  await expect(session.update(8)).rejects.toThrow();
  expect((await session.restart(9)).documentUrl).toBe(replacementUrl);
  expect(counts()).toEqual({starts:2,updates:1,renewals:0});
 });
 it("discards the hidden recovery candidate on close",async()=>{
  const {session,counts}=fixture("lost");await session.start(7);
  await expect(session.update(8)).rejects.toThrow();session.close();
  await expect(session.restart(8)).rejects.toMatchObject({code:"CLOSED"});
  expect(counts()).toEqual({starts:1,updates:1,renewals:0});
 });
});

describe("H10W2F7 combined browser acknowledgment",()=>{
 for(const confirmed of [true,false])it(`handles combined grant=${confirmed} without replaying the update`,async()=>{
  let writes=0,renewals=0;
  const fetchClient=vi.fn(async(path:string,init:RequestInit)=>{
   if(path.endsWith("/development/start"))return json({ok:true,previewId,sourceVersion:7});
   if(path.endsWith("/development/read-access"))return json({ok:true,documentUrl:url,basePath:url,sourceVersion:7});
   if(path.endsWith("/development/update")){
    writes++;expect(JSON.parse(String(init.body))).toEqual({sourceVersion:8,grantToken:token});
    return json({ok:true,action:"updated",sourceVersion:8,grantRenewed:confirmed});
   }
   if(path.endsWith("/development/renew-access")){renewals++;return json({ok:true,sourceVersion:8});}
   throw Error("unexpected request");
  });
  const session=createDevelopmentPreviewBrowserSession({buildProjectId:"project_1",fetchClient});
  await session.start(7);
  if(confirmed){expect(await session.update(8)).toMatchObject({documentUrl:url,sourceVersion:8});expect(renewals).toBe(0);}
  else {await expect(session.update(8)).rejects.toMatchObject({code:"UNAVAILABLE"});expect(session.snapshot()).toBeNull();
   expect(await session.restart(8)).toMatchObject({documentUrl:url,sourceVersion:8});expect(renewals).toBe(1);}
  expect(writes).toBe(1);
 });
 it("rejects a combined acknowledgment for the wrong source revision",async()=>{
  const fetchClient=vi.fn(async(path:string)=>path.endsWith("/development/start")?json({ok:true,previewId,sourceVersion:7}):
   path.endsWith("/development/read-access")?json({ok:true,documentUrl:url,basePath:url,sourceVersion:7}):
   json({ok:true,action:"updated",sourceVersion:9,grantRenewed:true}));
  const session=createDevelopmentPreviewBrowserSession({buildProjectId:"project_1",fetchClient});
  await session.start(7);await expect(session.update(8)).rejects.toMatchObject({code:"UNAVAILABLE"});
  expect(session.snapshot()).toBeNull();
 });
});
