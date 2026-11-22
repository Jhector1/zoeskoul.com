import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/verify-build/route.ts",import.meta.url),"utf8");
const shell=readFileSync(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",import.meta.url),"utf8");
describe("V12K5C3 saved-source build verification boundary",()=>{
  it("authorizes the current owner and enforces a matching persisted version",()=>{
    expect(route).toContain("enforceSameOriginPost(req)");
    expect(route).toContain("loadCurrentBuildAccessSnapshot(req,{requireAuthority:true})");
    expect(route).toContain("resolveBuildAccess(access).canEditWithAi");
    expect(route).toContain("project.sourceVersion !== requestedVersion");
    expect(route).toContain('project.stackId !== "react-vite-v1"');
  });
  it("builds only the saved server workspace and performs no source mutation or AI calls",()=>{
    expect(route).toContain("workspace:project.workspace,edits:[]");
    expect(route).toContain('sourceKind:"saved",correlationId:requestId');
    expect(route).not.toContain("generateJsonText(");
    expect(route).not.toContain("saveBuildProjectSourceCommand(");
    expect(route).not.toContain("publishOwnedProject(");
  });
  it("keeps an explicit manual retry separate from the proposed edit apply",()=>{
    expect(shell).toContain('Verify saved build (no AI)');
    expect(shell).toContain('zoe-saved-build-verification');
    expect(shell).toContain('JSON.stringify({sourceVersion})');
    expect(shell).toContain('codeDirtyRef.current || assistantRequestInFlight.current');
  });
});


const m=vi.hoisted(()=>({access:vi.fn(),project:vi.fn(),current:vi.fn(),verify:vi.fn(),origin:vi.fn(),legacy:vi.fn()}));
vi.mock("@zoeskoul/build-application",()=>({BuildAccessError:class extends Error{},
  resolveBuildAccess:(access:{entitlements:string[]})=>({canEditWithAi:access.entitlements.includes("build_ai_edit")}),
  getBuildProjectCommand:m.project}));
vi.mock("@zoeskoul/platform-server/http",()=>({enforceSameOriginPost:m.origin}));
vi.mock("@zoeskoul/platform-server/prisma",()=>({prisma:{buildProject:{findFirst:m.current},$queryRaw:()=>{throw Error("unexpected pilot database")}}}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:m.access}));
vi.mock("@/lib/build/readBuildProjects",()=>({createPrismaBuildProjectReader:()=>({})}));
vi.mock("@/lib/build/zoeReactIsolatedBuild",()=>({verifyZoeReactCandidateAtRunner:m.legacy}));
vi.mock("@/lib/build/zoeTanstackWorkerCandidate",()=>({verifyTanstackWorkerEditCandidate:m.verify}));
import {POST} from "../../app/api/build/projects/[buildProjectId]/assistant/verify-build/route";
const saved={stackId:"tanstack-start-v1",specification:{},workspace:{},sourceVersion:3,status:"draft"};
const send=(body:unknown={sourceVersion:3})=>POST(new Request("http://localhost:3004/api/build/projects/project-a/assistant/verify-build",{method:"POST",body:JSON.stringify(body)}),{params:Promise.resolve({buildProjectId:"project-a"})});
describe("U20 ordinary saved route (mocked ports, no DB or Runner)",()=>{
  beforeEach(()=>{
    vi.resetAllMocks();vi.stubEnv("ZOEBUILD_GENERAL_WORKER_VERIFICATION","1");
    m.origin.mockReturnValue(true);m.access.mockResolvedValue({userId:"owner-a",entitlements:["build_ai_edit"]});
    m.project.mockResolvedValue(saved);m.current.mockResolvedValue({id:"project-a"});
    m.verify.mockResolvedValue({state:"passed",sourceVersion:3,runtimeSmoke:{state:"failed"}});
  });
  afterEach(()=>vi.unstubAllEnvs());
  it("uses only the owner's saved snapshot and requires runtime evidence",async()=>{
    expect((await send()).status).toBe(200);
    expect(m.verify).toHaveBeenCalledWith(expect.objectContaining({userId:"owner-a",buildProjectId:"project-a",sourceVersion:3,sourceKind:"saved",edits:[],workspace:saved.workspace,requireRuntimeReceipt:true}));
    expect(m.current).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({codeProject:{ownerId:"owner-a",archivedAt:null,currentVersion:3}})}));
  });
  it("rejects a stale completion after the actual build returns",async()=>{
    m.current.mockResolvedValue(null);expect((await send()).status).toBe(409);expect(m.verify).toHaveBeenCalledTimes(1);
  });
  it("rejects cross-origin, no entitlement, missing project, stale input and client source fields before building",async()=>{
    m.origin.mockReturnValue(false);expect((await send()).status).toBe(403);m.origin.mockReturnValue(true);
    m.access.mockResolvedValue({userId:"owner-a",entitlements:[]});expect((await send()).status).toBe(403);
    m.access.mockResolvedValue({userId:"owner-a",entitlements:["build_ai_edit"]});m.project.mockResolvedValue(null);expect((await send()).status).toBe(404);
    m.project.mockResolvedValue(saved);expect((await send({sourceVersion:2})).status).toBe(409);
    expect((await send({sourceVersion:3,files:[]})).status).toBe(400);expect(m.verify).not.toHaveBeenCalled();
  });
  it("does not enable the ordinary lane when the operator flag is absent",async()=>{
    vi.stubEnv("ZOEBUILD_GENERAL_WORKER_VERIFICATION","");expect((await send()).status).toBe(422);expect(m.verify).not.toHaveBeenCalled();
  });
});
