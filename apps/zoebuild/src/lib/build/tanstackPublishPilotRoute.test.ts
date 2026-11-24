import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const m=vi.hoisted(()=>({sameOrigin:vi.fn(),access:vi.fn(),decision:vi.fn(),rate:vi.fn(),project:vi.fn(),prepare:vi.fn(),actor:vi.fn(),execute:vi.fn(),store:vi.fn(),stage:vi.fn(),read:vi.fn(),current:vi.fn()}));
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
import { POST } from "../../app/api/build/projects/[buildProjectId]/publish-pilot/route";
const bytes=Buffer.from("private verified bundle");
const objectSha256=createHash("sha256").update(bytes).digest("hex");
const ctx={params:Promise.resolve({buildProjectId:"project1"})};
function req(version="3",url="http://localhost:3004/api/build/projects/project1/publish-pilot",body?:string){return new Request(url,{method:"POST",headers:{"x-zoebuild-pilot-version":version,origin:"http://localhost:3004"},...(body===undefined?{}:{body})});}
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("NODE_ENV","development");vi.stubEnv("ZOEBUILD_PUBLISH_ENABLED","0");vi.stubEnv("ZOEBUILD_PRIVATE_PUBLISH_PILOT","project1:3");
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
  it("requires owner scoped project",async()=>{m.project.mockResolvedValue(null);expect((await POST(req(),ctx)).status).toBe(404);expect(m.execute).not.toHaveBeenCalled();});
  it("rejects stale source after staging",async()=>{m.current.mockResolvedValue(null);expect((await POST(req(),ctx)).status).toBe(409);});
  it("rejects mismatched R2 readback",async()=>{m.read.mockResolvedValue(Buffer.from("tampered"));expect((await POST(req(),ctx)).status).toBe(503);expect(m.current).not.toHaveBeenCalled();});
  it("returns only the private verified bundle from the trusted Runner",async()=>{const res=await POST(req(),ctx);expect(res.status).toBe(200);expect(res.headers.get("x-zoebuild-object-sha256")).toBe(objectSha256);expect(res.headers.get("cache-control")).toBe("no-store");expect(await res.text()).toBe(bytes.toString());expect(m.stage).toHaveBeenCalledWith(expect.objectContaining({ownerId:"owner1",execution:{ok:true}}));expect(m.current).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:"project1",codeProject:{ownerId:"owner1",archivedAt:null,currentVersion:3}})}));});
});
