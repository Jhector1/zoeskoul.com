import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { sha256, type ZoeSourceEdit } from "./zoeTargetedSourceEdit";
import { parseBuildWorkspaceMutation } from "./buildWorkspaceMutation";
import { prepareZoeIsolatedBuildCandidate, verifyZoeReactCandidateAtRunner } from "./zoeReactIsolatedBuild";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/runnerActorKey", () => ({requireRunnerActorKey: vi.fn()}));
vi.mock("./buildExecutorValidation", () => ({executeTrustedProductionBuildAtRunner: vi.fn()}));
vi.mock("@zoeskoul/platform-server/security/ratelimit", () => ({rateLimit: vi.fn()}));
vi.mock("@zoeskoul/platform-server/server/runnerClient", () => ({
  RunnerHttpError: class RunnerHttpError extends Error { constructor(public status: number, message: string) {super(message);} },
}));
vi.mock("@zoeskoul/build-preparation", () => ({
  BuildPreparationError: class BuildPreparationError extends Error {},
  createRegisteredProductionBuildJob: vi.fn(({buildProjectId,sourceVersion,workspace}) => ({
    protocolVersion:1, operation:"production-build", buildProjectId, sourceVersion, stackId:"react-vite-v1",templateId:"react-vite-v1",
    files: workspace.nodes.filter((item:{kind:string})=>item.kind==="file")
      .map((item:{name:string,content:string})=>({path:item.name,content:item.content}))
      .sort((a:{path:string},b:{path:string})=>a.path.localeCompare(b.path)),
  })),
}));

function workspace(): WorkspaceStateV2 {
  return {version:2,language:"web",nodes:[
    {id:"folder",kind:"folder",name:"src",parentId:null,createdAt:1,updatedAt:1},
    {id:"app",kind:"file",name:"App.tsx",parentId:"folder",content:"export default function App(){return null}",createdAt:1,updatedAt:1},
    {id:"main",kind:"file",name:"main.tsx",parentId:"folder",content:"import App from './App'",createdAt:1,updatedAt:1},
    {id:"index",kind:"file",name:"index.html",parentId:null,content:"<html><div id='root'></div></html>",createdAt:1,updatedAt:1},
  ],
    openTabs:["app"],
    activeFileId:"app",
    entryFileId:"app",
    stdin:"",
    expanded:["folder"],
    leftPct:25,
  } as unknown as WorkspaceStateV2;
}
const oldApp = "export default function App(){return null}";
const edits: ZoeSourceEdit[] = [{path:"src/App.tsx",beforeSha256:sha256(oldApp),
  content:"export default function App(){return <main>Test</main>}"}];
const mockSpec = {} as Parameters<typeof prepareZoeIsolatedBuildCandidate>[0]["specification"];
const input = () => ({ userId:"owner", buildProjectId:"project-1", sourceVersion:7,
  workspace:workspace(), edits, specification:mockSpec });
function runnerResponse() {return {ok:true,result:{protocolVersion:1,operation:"production-build",buildProjectId:"project-1",sourceVersion:7,
  artifact:{type:"static-directory",outputPath:"dist",totalBytes:20,sha256:"a".repeat(64),files:[]}}} as const;}
function dependencies(args: {allowed?:boolean; failure?:Error; response?: ReturnType<typeof runnerResponse>}={}) {
  const limit=vi.fn(async()=>({ok:args.allowed??true}));
  const actorKey=vi.fn(async()=>"trusted-actor");
  const build=vi.fn(async()=>{if(args.failure)throw args.failure;return args.response??runnerResponse();});
  return {limit,actorKey,build} as unknown as NonNullable<Parameters<typeof verifyZoeReactCandidateAtRunner>[0]["dependencies"]>;
}

describe("V12K5C isolated candidate verification",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("builds exact reviewed source snapshot without touching original workspace",()=>{
    const origin=workspace(), original=JSON.stringify(origin);
    // The runner candidate must be built from a workspace accepted by the
    // same canonical validator used for approved edits and source saves.
    expect(() => parseBuildWorkspaceMutation(origin)).not.toThrow();
    const candidate=prepareZoeIsolatedBuildCandidate({...input(),workspace:origin});
    expect(candidate.request.operation).toBe("production-build");
    expect(candidate.request.files.find(file=>file.path==="App.tsx")?.content).toContain("<main>Test</main>");
    expect(JSON.stringify(origin)).toBe(original);
    expect(candidate.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("reports passed only for matching signed runner build result; no browser claim",async()=>{
    const deps=dependencies();
    const evidence=await verifyZoeReactCandidateAtRunner({...input(),dependencies:deps});
    expect(evidence).toMatchObject({state:"passed",reason:"runner-passed",sourceVersion:7,browser:"not-run",artifactSha256:"a".repeat(64)});
    expect(deps.build).toHaveBeenCalledOnce();
    const request=vi.mocked(deps.build).mock.calls[0]?.[0].request;
    expect(request.operation).toBe("production-build");
    expect(request.sourceVersion).toBe(7);
  });
  it("never passes on mismatched runner project/source or incomplete digest",async()=>{
    const bad={...runnerResponse(),result:{...runnerResponse().result,sourceVersion:8}} as unknown as ReturnType<typeof runnerResponse>;
    const evidence=await verifyZoeReactCandidateAtRunner({...input(),dependencies:dependencies({response:bad})});
    expect(evidence).toMatchObject({state:"not-run",reason:"runner-response-mismatch"});
    expect(evidence.artifactSha256).toBeNull();
  });
  it("does not execute when capacity is reached",async()=>{
    const deps=dependencies({allowed:false});
    const evidence=await verifyZoeReactCandidateAtRunner({...input(),dependencies:deps});
    expect(evidence).toMatchObject({state:"not-run",reason:"capacity"});
    expect(deps.actorKey).not.toHaveBeenCalled();
    expect(deps.build).not.toHaveBeenCalled();
  });
  it("labels a verified compile rejection failed without leaking runner stderr",async()=>{
    const {RunnerHttpError}=await import("@zoeskoul/platform-server/server/runnerClient");
    const evidence=await verifyZoeReactCandidateAtRunner({...input(),dependencies:dependencies({failure:new RunnerHttpError(422,"secret-data")})});
    expect(evidence).toMatchObject({state:"failed",reason:"runner-build-rejected"});
    expect(JSON.stringify(evidence)).not.toContain("secret-data");
  });
  it("labels connectivity failures unavailable, never compile-success",async()=>{
    const evidence=await verifyZoeReactCandidateAtRunner({...input(),dependencies:dependencies({failure:new Error("connect failed")})});
    expect(evidence).toMatchObject({state:"not-run",reason:"runner-transport"});
  });
  it("rejects empty AI candidate proposals before calling the runner", async()=>{
    const deps=dependencies();
    await expect(verifyZoeReactCandidateAtRunner({
      ...input(),edits:[],sourceKind:"candidate",dependencies:deps,
    })).rejects.toThrow("Expected one to five approved file changes.");
    expect(deps.build).not.toHaveBeenCalled();
  });
  it("rejects edits smuggled into saved-build mode before calling the runner", async()=>{
    const deps=dependencies();
    await expect(verifyZoeReactCandidateAtRunner({
      ...input(),sourceKind:"saved",dependencies:deps,
    })).rejects.toThrow("Saved build verification must not include source edits.");
    expect(deps.build).not.toHaveBeenCalled();
  });
  it("requires a canonically valid persisted workspace in saved mode", async()=>{
    const deps=dependencies();
    await expect(verifyZoeReactCandidateAtRunner({
      ...input(),edits:[],sourceKind:"saved",workspace:null as unknown as WorkspaceStateV2,dependencies:deps,
    })).rejects.toThrow();
    expect(deps.build).not.toHaveBeenCalled();
  });
  it("builds saved source without edits and retains the exact saved source version",async()=>{
    const deps=dependencies();
    const evidence=await verifyZoeReactCandidateAtRunner({...input(),edits:[],sourceKind:"saved",correlationId:"check-123",dependencies:deps});
    expect(evidence).toMatchObject({state:"passed",sourceKind:"saved",verificationId:"check-123",sourceVersion:7});
    expect(deps.build).toHaveBeenCalledOnce();
    expect(vi.mocked(deps.build).mock.calls[0]?.[0].request.sourceVersion).toBe(7);
  });
  it("distinguishes runner auth, missing endpoint, capacity and service errors",async()=>{
    const {RunnerHttpError}=await import("@zoeskoul/platform-server/server/runnerClient");
    for (const [status,reason] of [[401,"runner-unauthorized"],[403,"runner-unauthorized"],
      [404,"runner-not-found"],[429,"capacity"],[504,"runner-timeout"],[502,"runner-service-error"]] as const) {
      const evidence=await verifyZoeReactCandidateAtRunner({...input(),dependencies:dependencies({failure:new RunnerHttpError(status,"private-token-secret")})});
      expect(evidence.reason).toBe(reason);
      expect(JSON.stringify(evidence)).not.toContain("private-token-secret");
    }
  });
  it("does not disclose transport exceptions; diagnoses trusted configuration and timeouts",async()=>{
    const unavailable=await verifyZoeReactCandidateAtRunner({...input(),dependencies:dependencies({failure:new Error("private runner URL")})});
    expect(unavailable.reason).toBe("runner-transport");
    expect(JSON.stringify(unavailable)).not.toContain("private runner URL");
    const missing=await verifyZoeReactCandidateAtRunner({...input(),dependencies:dependencies({failure:new Error("Missing RUNNER_BASE_URL")})});
    expect(missing.reason).toBe("runner-configuration");
    const timeout=Object.assign(new Error("private timeout"),{name:"TimeoutError"});
    const result=await verifyZoeReactCandidateAtRunner({...input(),dependencies:dependencies({failure:timeout})});
    expect(result.reason).toBe("runner-timeout");
  });

});
