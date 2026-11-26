import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { RunnerHttpError,parseRunnerBuildDiagnostic } from "@zoeskoul/platform-server/server/runnerClient";
const m=vi.hoisted(()=>({sameOrigin:vi.fn(),access:vi.fn(),decision:vi.fn(),rate:vi.fn(),project:vi.fn(),prepare:vi.fn(),actor:vi.fn(),execute:vi.fn(),store:vi.fn(),stage:vi.fn(),read:vi.fn(),current:vi.fn(),control:vi.fn(),hostedControl:vi.fn(),management:vi.fn()}));
vi.mock("next/server",()=>({NextResponse:{json:(data:unknown,init:ResponseInit)=>Response.json(data,init)}}));
vi.mock("@zoeskoul/build-application",()=>({getBuildProjectCommand:m.project,resolveBuildAccess:m.decision}));
vi.mock("@zoeskoul/build-preparation",()=>({createRegisteredProductionBuildJob:m.prepare}));
vi.mock("@zoeskoul/platform-server/http",()=>({enforceSameOriginPost:m.sameOrigin}));
vi.mock("@zoeskoul/platform-server/security/ratelimit",()=>({rateLimit:m.rate}));
vi.mock("@zoeskoul/platform-server/prisma",()=>({prisma:{buildProject:{findFirst:m.current}}}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:m.access}));
vi.mock("@/lib/build/readBuildProjects",()=>({createPrismaBuildProjectReader:()=>({})}));
vi.mock("@/lib/build/buildExecutorValidation",()=>({executeTrustedProductionBuildAtRunner:m.execute}));
vi.mock("@/lib/build/cloudflareR2MediaServer",()=>({createZoeBuildPrivateR2PublishBundleStore:m.store}));
vi.mock("@/lib/build/tanstackPublishArtifact",()=>({stageTanstackPublishArtifact:m.stage}));
vi.mock("@/lib/server/runnerActorKey",()=>({requireRunnerActorKey:m.actor}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/build/privatePublishControl",async(importOriginal)=>({...(await importOriginal<typeof import("./privatePublishControl")>()),invokePrivatePublishControl:m.control,invokeHostedPublishControl:m.hostedControl,invokePrivateReleaseManagement:m.management}));
import { runPrivatePublish,readPrivatePublish,managePrivatePublish } from "./tanstackPublishPilotServer";
import { POST } from "../../app/api/build/projects/[buildProjectId]/publish-pilot/route";
import { POST as HOSTED_POST } from "../../app/api/build/projects/[buildProjectId]/publish-hosted-pilot/route";
const bytes=Buffer.from("private verified bundle");
const objectSha256=createHash("sha256").update(bytes).digest("hex");
const ctx={params:Promise.resolve({buildProjectId:"project1"})};
function req(version="3",url="http://localhost:3004/api/build/projects/project1/publish-pilot",body?:string){return new Request(url,{method:"POST",headers:{"x-zoebuild-pilot-version":version,origin:"http://localhost:3004"},...(body===undefined?{}:{body})});}
beforeEach(()=>{
  vi.resetAllMocks();for(const key of ["VERCEL_ENV","ZOEBUILD_HOSTED_PUBLISH_DEV","ZOEBUILD_HOSTED_PUBLISH_DEV_OWNER","ZOEBUILD_HOSTED_PUBLISH_DEV_PROJECTS"])vi.stubEnv(key,undefined);vi.stubEnv("NODE_ENV","development");vi.stubEnv("ZOEBUILD_PUBLISH_ENABLED","0");vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_PILOT","project1:3");vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER",undefined);vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION",undefined);vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION_PROJECT",undefined);
  m.sameOrigin.mockReturnValue(true);m.access.mockResolvedValue({userId:"owner1"});m.decision.mockReturnValue({canPublish:true});m.rate.mockResolvedValue({ok:true});
  m.project.mockResolvedValue({sourceVersion:3,status:"draft",stackId:"tanstack-start-v1",specification:{},workspace:{}});m.prepare.mockReturnValue({files:[]});m.actor.mockResolvedValue("actor");m.execute.mockResolvedValue({ok:true});m.store.mockReturnValue({read:m.read});m.stage.mockResolvedValue({objectKey:"private-key",objectSha256,artifactSha256:"a".repeat(64)});m.read.mockResolvedValue(bytes);m.current.mockResolvedValue({id:"project1"});
});
afterEach(()=>vi.unstubAllEnvs());
describe("operator-only Worker publishing handoff",()=>{
  it("is disabled in production before any auth or compile",async()=>{vi.stubEnv("NODE_ENV","production");expect((await POST(req(),ctx)).status).toBe(404);expect(m.access).not.toHaveBeenCalled();});
  it("denies unauthorized origin",async()=>{m.sameOrigin.mockReturnValue(false);expect((await POST(req(),ctx)).status).toBe(403);expect(m.execute).not.toHaveBeenCalled();});
  it("denies browser supplied source",async()=>{expect((await POST(req("3",undefined,"{}"),ctx)).status).toBe(400);expect(m.execute).not.toHaveBeenCalled();});
  it("denies a different revision",async()=>{expect((await POST(req("4"),ctx)).status).toBe(403);expect(m.project).not.toHaveBeenCalled();});
  it("requires existing publish entitlement",async()=>{m.decision.mockReturnValue({canPublish:false});expect((await POST(req(),ctx)).status).toBe(403);expect(m.execute).not.toHaveBeenCalled();});
  it("accepts only the explicitly selected local owner without paid publishing",async()=>{vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER","owner1");m.decision.mockReturnValue({canPublish:false});expect((await POST(req(),ctx)).status).toBe(200);expect(m.execute).toHaveBeenCalledOnce();});
  it("rejects a different actor even with paid publishing",async()=>{vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER","other1");expect((await POST(req(),ctx)).status).toBe(403);expect(m.project).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();});
  it("still requires ownership for selected operator",async()=>{vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER","owner1");m.decision.mockReturnValue({canPublish:false});m.project.mockResolvedValue(null);expect((await POST(req(),ctx)).status).toBe(404);expect(m.execute).not.toHaveBeenCalled();});
  it("rejects explicit local owner authorization in production",async()=>{vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER","owner1");vi.stubEnv("NODE_ENV","production");expect((await POST(req(),ctx)).status).toBe(404);expect(m.access).not.toHaveBeenCalled();});
  it("requires owner scoped project",async()=>{m.project.mockResolvedValue(null);expect((await POST(req(),ctx)).status).toBe(404);expect(m.execute).not.toHaveBeenCalled();});
  it("rejects stale source after staging",async()=>{m.current.mockResolvedValue(null);expect((await POST(req(),ctx)).status).toBe(409);});
  it("rejects mismatched R2 readback",async()=>{m.read.mockResolvedValue(Buffer.from("tampered"));expect((await POST(req(),ctx)).status).toBe(503);expect(m.current).not.toHaveBeenCalled();});
  it("returns only the private verified bundle from the trusted Runner",async()=>{const res=await POST(req(),ctx);expect(res.status).toBe(200);expect(res.headers.get("x-zoebuild-object-sha256")).toBe(objectSha256);expect(res.headers.get("cache-control")).toBe("no-store");expect(await res.text()).toBe(bytes.toString());expect(m.stage).toHaveBeenCalledWith(expect.objectContaining({ownerId:"owner1",execution:{ok:true}}));expect(m.current).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:"project1",codeProject:{ownerId:"owner1",archivedAt:null,currentVersion:3}})}));});
});

describe("PUB2A explicit private activation",()=>{
  const receipt={deploymentId:objectSha256,sourceVersion:3,artifactHash:"a".repeat(64),deployedAt:"2026-11-24T00:00:00Z",publicUrl:"http://127.0.0.1:33105/",privatePilot:true};
  const enable=()=>{vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER","owner1");vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION","1");vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION_PROJECT","project1");m.control.mockImplementation(async(op)=>op==="status"?null:receipt);};
  it("does not activate without an explicit owner and automation flag",async()=>{expect((await runPrivatePublish(req(),ctx,true)).status).toBe(404);expect(m.control).not.toHaveBeenCalled();});
  it("denies a different actor before invoking the VM",async()=>{enable();m.access.mockResolvedValue({userId:"other1"});expect((await runPrivatePublish(req(),ctx,true)).status).toBe(403);expect(m.control).not.toHaveBeenCalled();});
  it("keeps the manual artifact download path even when automation is enabled",async()=>{enable();const result=await POST(req(),ctx);expect(result.status).toBe(200);expect(await result.text()).toBe(bytes.toString());expect(m.control).not.toHaveBeenCalled();});
  it("activates only after trusted build, readback and current owner recheck",async()=>{enable();const result=await runPrivatePublish(req("999"),ctx,true);expect(result.status).toBe(200);expect(await result.json()).toEqual({ok:true,deployment:{...receipt,reused:false}});expect(m.control).toHaveBeenCalledWith("activate",{projectId:"project1",sourceVersion:3,objectSha256,artifactHash:"a".repeat(64),bytes});expect(m.current.mock.invocationCallOrder[0]).toBeLessThan(m.control.mock.invocationCallOrder[1]);});
  it("captures the latest saved revision without changing the manual selection",async()=>{enable();m.project.mockResolvedValue({sourceVersion:4,status:"draft",stackId:"tanstack-start-v1",specification:{},workspace:{}});m.control.mockImplementation(async(op)=>op==="status"?receipt:{...receipt,sourceVersion:4});const result=await runPrivatePublish(req("999"),ctx,true);expect(result.status).toBe(200);expect((await result.json()).deployment.sourceVersion).toBe(4);expect(m.control).toHaveBeenCalledWith("activate",expect.objectContaining({sourceVersion:4}));});
  it("reuses an unchanged healthy release without compiling",async()=>{enable();m.control.mockResolvedValue(receipt);const result=await runPrivatePublish(req(),ctx,true);expect((await result.json()).deployment.reused).toBe(true);expect(m.execute).not.toHaveBeenCalled();expect(m.current).toHaveBeenCalledOnce();});
  it("never activates a stale source or failed readback",async()=>{enable();m.current.mockResolvedValue(null);expect((await runPrivatePublish(req(),ctx,true)).status).toBe(409);expect(m.control).toHaveBeenCalledTimes(1);});
  it("reports activation failure without claiming a new deployment",async()=>{enable();m.control.mockImplementation(async(op)=>{if(op==="status")return null;throw new Error("private log");});const result=await runPrivatePublish(req(),ctx,true);expect(result.status).toBe(503);expect(await result.json()).toEqual({ok:false,code:"BUILD_PILOT_ACTIVATE_FAILED"});});
  it("hydrates the selected owner without compiling and denies other actors",async()=>{enable();m.control.mockResolvedValue(receipt);const request=new Request("http://localhost:3004/api/build/projects/project1/publish");expect((await (await readPrivatePublish(request,ctx)).json()).deployment).toEqual(receipt);expect(m.execute).not.toHaveBeenCalled();m.access.mockResolvedValue({userId:"other1"});expect((await readPrivatePublish(request,ctx)).status).toBe(403);expect(m.control).toHaveBeenCalledTimes(1);});
});

describe("PUB2B1 private release management",()=>{
  const active={deploymentId:objectSha256,sourceVersion:3,artifactHash:"a".repeat(64),deployedAt:"2026-11-24T00:00:00Z",publicUrl:"http://127.0.0.1:33105/",privatePilot:true};
  const history={active,releases:[{deploymentId:active.deploymentId,sourceVersion:active.sourceVersion,artifactHash:active.artifactHash,createdAt:active.deployedAt}]};
  const enable=()=>{vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER","owner1");vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION","1");vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION_PROJECT","project1");m.management.mockResolvedValue(history);m.control.mockResolvedValue(null);};
  const url="http://localhost:3004/api/build/projects/project1/publish/manage";
  const request=(action="restore",target=objectSha256,current=objectSha256)=>new Request(url,{method:"POST",headers:{"x-zoebuild-release-action":action,...(target?{"x-zoebuild-release-target":target}:{}),"x-zoebuild-release-active":current,...(current==="none"?{}:{"x-zoebuild-release-activated-at":active.deployedAt})}});
  it("lists only the selected owner; never compiles",async()=>{enable();expect(await (await managePrivatePublish(new Request(url),ctx)).json()).toEqual({ok:true,history});expect(m.management).toHaveBeenCalledWith("project1",undefined);expect(m.execute).not.toHaveBeenCalled();m.access.mockResolvedValue({userId:"other1"});expect((await managePrivatePublish(new Request(url),ctx)).status).toBe(403);expect(m.management).toHaveBeenCalledTimes(1);});
  it("disallows production and unselected projects",async()=>{enable();vi.stubEnv("NODE_ENV","production");expect((await managePrivatePublish(new Request(url),ctx)).status).toBe(404);expect(m.management).not.toHaveBeenCalled();});
  it("validates action, target and same origin",async()=>{enable();expect((await managePrivatePublish(request("restore","bad"),ctx)).status).toBe(400);expect((await managePrivatePublish(request("unpublish"),ctx)).status).toBe(400);m.sameOrigin.mockReturnValue(false);expect((await managePrivatePublish(request(),ctx)).status).toBe(403);expect(m.management).not.toHaveBeenCalled();});
  it("restores only an exact release and expected active identity",async()=>{enable();expect((await managePrivatePublish(request(),ctx)).status).toBe(200);expect(m.management).toHaveBeenCalledWith("project1",{action:"restore",target:objectSha256,expected:{objectSha256,activatedAt:active.deployedAt}});expect(m.execute).not.toHaveBeenCalled();});
  it("unpublishes without compiling and republish can target a retained release",async()=>{enable();m.management.mockResolvedValue({...history,active:null});expect((await managePrivatePublish(request("unpublish",""),ctx)).status).toBe(200);expect(m.management).toHaveBeenLastCalledWith("project1",{action:"unpublish",target:null,expected:{objectSha256,activatedAt:active.deployedAt}});m.management.mockResolvedValue(history);expect((await managePrivatePublish(request("restore",objectSha256,"none"),ctx)).status).toBe(200);expect(m.management).toHaveBeenLastCalledWith("project1",{action:"restore",target:objectSha256,expected:null});expect(m.execute).not.toHaveBeenCalled();});
  it("does not report success when host rejects the operation",async()=>{enable();m.management.mockRejectedValue(new Error("private"));expect((await managePrivatePublish(request(),ctx)).status).toBe(503);});
  it("serializes management against an in-flight publish in the local server",async()=>{enable();let start!:()=>void,finish!:()=>void;const started=new Promise<void>(r=>{start=r});const gate=new Promise<void>(r=>{finish=r});m.execute.mockImplementation(async()=>{start();await gate;return {ok:true};});m.control.mockImplementation(async op=>op==="status"?null:active);const pending=runPrivatePublish(req(),ctx,true);await started;try{expect((await managePrivatePublish(request(),ctx)).status).toBe(409);expect(m.management).not.toHaveBeenCalled();}finally{finish();await pending;}expect((await managePrivatePublish(request(),ctx)).status).toBe(200);});
});


describe("PUB3A5C4 explicit hosted pilot activation",()=>{
  const hostname="blue-gallery.sites.zoebuild.test";
  const receipt={deploymentId:objectSha256,sourceVersion:3,artifactHash:"a".repeat(64),deployedAt:"2026-11-24T00:00:00Z",publicUrl:"http://127.0.0.1:33105/",privatePilot:true};
  const enable=()=>{
    vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION_PROJECT","legacy1");
    vi.stubEnv("ZOEBUILD_HOSTED_PUBLISH_DEV","1");
    vi.stubEnv("ZOEBUILD_HOSTED_PUBLISH_DEV_OWNER","owner1");
    vi.stubEnv("ZOEBUILD_HOSTED_PUBLISH_DEV_PROJECTS","project1,project2");
    m.current.mockResolvedValueOnce({hostedHostname:{hostname}}).mockResolvedValue({id:"project1"});
    m.hostedControl.mockImplementation(async op=>op==="status"?null:receipt);
  };
  const request=()=>req("999","http://localhost:3004/api/build/projects/project1/publish-hosted-pilot");
  it("disabled by default before authentication",async()=>{expect((await HOSTED_POST(request(),ctx)).status).toBe(404);expect(m.access).not.toHaveBeenCalled();});
  it("rejects production, public publishing, wrong scope and legacy inclusion",async()=>{
    enable();for(const [key,value] of [["NODE_ENV","production"],["VERCEL_ENV","production"],["ZOEBUILD_PUBLISH_ENABLED","1"],["ZOEBUILD_HOSTED_PUBLISH_DEV_PROJECTS","legacy1,project1"],["ZOEBUILD_HOSTED_PUBLISH_DEV_PROJECTS","project2"],["ZOEBUILD_HOSTED_PUBLISH_DEV_PROJECTS","project1,project1"],["ZOEBUILD_HOSTED_PUBLISH_DEV_PROJECTS","project1,project2,project3"]]){
      const prior=process.env[key];vi.stubEnv(key,value);expect((await HOSTED_POST(request(),ctx)).status).toBe(404);vi.stubEnv(key,prior);
    }expect(m.access).not.toHaveBeenCalled();expect(m.control).not.toHaveBeenCalled();
  });
  it("rejects an unauthorized actor before project lookup",async()=>{enable();m.access.mockResolvedValue({userId:"other1"});expect((await HOSTED_POST(request(),ctx)).status).toBe(403);expect(m.project).not.toHaveBeenCalled();expect(m.hostedControl).not.toHaveBeenCalled();});
  it("requires the current owned, reserved project",async()=>{enable();m.current.mockReset().mockResolvedValue({hostedHostname:null});expect((await HOSTED_POST(request(),ctx)).status).toBe(409);expect(m.hostedControl).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();});
  it("rejects invalid reservations before invoking the host",async()=>{enable();m.current.mockReset().mockResolvedValue({hostedHostname:{hostname:"admin.sites.zoebuild.test"}});expect((await HOSTED_POST(request(),ctx)).status).toBe(409);expect(m.hostedControl).not.toHaveBeenCalled();});
  it("uses the hosted controller only after R2 readback and reservation recheck",async()=>{enable();const res=await HOSTED_POST(request(),ctx);expect(res.status).toBe(200);expect(await res.json()).toEqual({ok:true,deployment:{deploymentId:receipt.deploymentId,sourceVersion:3,artifactHash:receipt.artifactHash,deployedAt:receipt.deployedAt,hostname,reused:false},browserAccess:false});expect(m.control).not.toHaveBeenCalled();expect(m.hostedControl).toHaveBeenCalledWith("activate",{projectId:"project1",sourceVersion:3,objectSha256,artifactHash:receipt.artifactHash,bytes});expect(m.current).toHaveBeenLastCalledWith(expect.objectContaining({where:expect.objectContaining({hostedHostname:{is:{hostname}},stackId:"tanstack-start-v1",codeProject:{ownerId:"owner1",archivedAt:null,currentVersion:3}})}));expect(m.current.mock.invocationCallOrder[1]).toBeLessThan(m.hostedControl.mock.invocationCallOrder[1]);});
  it("rejects stale reservations or source before activation",async()=>{enable();m.current.mockResolvedValue(null);expect((await HOSTED_POST(request(),ctx)).status).toBe(409);expect(m.hostedControl).toHaveBeenCalledTimes(1);expect(m.control).not.toHaveBeenCalled();});
  it("reuses the existing active revision without recompiling",async()=>{enable();m.hostedControl.mockResolvedValue(receipt);const res=await HOSTED_POST(request(),ctx);expect(res.status).toBe(200);expect((await res.json()).deployment.reused).toBe(true);expect(m.execute).not.toHaveBeenCalled();});
  it("rejects failed R2 readback without activating",async()=>{enable();m.read.mockResolvedValue(Buffer.from("tampered"));expect((await HOSTED_POST(request(),ctx)).status).toBe(503);expect(m.hostedControl).toHaveBeenCalledTimes(1);});
  it("returns only transport-validated compiler diagnostics to the hosted owner",async()=>{
    enable();
    const diagnostic=parseRunnerBuildDiagnostic({stage:"build",category:"nonzero-exit",exitCode:2,oomKilled:false,timedOut:false,logProbe:"available",stderr:"private stderr",compilerDiagnostics:[{code:"TS2322",path:"src/routes/index.tsx",line:42,column:10,message:"private prose"},{code:"TS2307",path:"/outside/private.ts",line:1,column:1}]},{operation:"production-build",files:[{path:"src/routes/index.tsx"}]});
    expect(diagnostic).toBeDefined();
    m.execute.mockRejectedValue(new RunnerHttpError(422,"private raw log","BUILD_COMPILATION_REJECTED",diagnostic));
    const res=await HOSTED_POST(request(),ctx);
    expect(res.status).toBe(503);expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ok:false,code:"BUILD_PILOT_COMPILE_FAILED",runnerCode:"BUILD_COMPILATION_REJECTED",buildDiagnostic:{stage:"build",category:"nonzero-exit",exitCode:2,oomKilled:false,timedOut:false,logProbe:"available",compilerDiagnostics:[{code:"TS2322",path:"src/routes/index.tsx",line:42,column:10}]}});
    expect(m.stage).not.toHaveBeenCalled();expect(m.read).not.toHaveBeenCalled();expect(m.hostedControl).toHaveBeenCalledTimes(1);
    // A failure must release the project mutation guard.
    m.current.mockResolvedValueOnce({hostedHostname:{hostname}});
    expect((await HOSTED_POST(request(),ctx)).status).toBe(503);
    expect(m.execute).toHaveBeenCalledTimes(2);
  });
  it("keeps generic compile failures opaque",async()=>{
    enable();m.execute.mockRejectedValue(new Error("private raw log"));
    const res=await HOSTED_POST(request(),ctx);expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ok:false,code:"BUILD_PILOT_COMPILE_FAILED"});
    expect(m.stage).not.toHaveBeenCalled();
  });
  it("keeps missing diagnostics and unexpected Runner codes opaque",async()=>{
    enable();m.execute.mockRejectedValue(new RunnerHttpError(422,"private raw log","BUILD_COMPILATION_REJECTED"));
    expect(await (await HOSTED_POST(request(),ctx)).json()).toEqual({ok:false,code:"BUILD_PILOT_COMPILE_FAILED"});
    m.current.mockResolvedValueOnce({hostedHostname:{hostname}});
    const diagnostic=parseRunnerBuildDiagnostic({stage:"build",category:"nonzero-exit",exitCode:2,oomKilled:false,timedOut:false,logProbe:"available",compilerDiagnostics:[]},{operation:"production-build",files:[]});
    m.execute.mockRejectedValue(new RunnerHttpError(422,"private raw log","UNEXPECTED_CODE",diagnostic));
    expect(await (await HOSTED_POST(request(),ctx)).json()).toEqual({ok:false,code:"BUILD_PILOT_COMPILE_FAILED"});
  });
  it("does not expose diagnostic errors to a different owner",async()=>{
    enable();m.access.mockResolvedValue({userId:"other1"});
    const res=await HOSTED_POST(request(),ctx);expect(res.status).toBe(403);expect(m.execute).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ok:false,code:"BUILD_PILOT_NOT_ENTITLED_OR_NOT_SELECTED"});
  });
});
