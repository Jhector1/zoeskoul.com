import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {enforceSameOriginPost} from "@zoeskoul/platform-server/http";
import {loadCurrentBuildAccessSnapshot} from "@/lib/build/currentBuildAccess";
import {revokeOwnedDevelopmentPreviewGrants} from "@/lib/build/reactPreviewDevelopmentDurableGrantServer";
import {POST} from "./route";
vi.mock("@zoeskoul/platform-server/http",()=>({enforceSameOriginPost:vi.fn()}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:vi.fn()}));
vi.mock("@/lib/build/reactPreviewDevelopmentDurableGrantServer",()=>({revokeOwnedDevelopmentPreviewGrants:vi.fn()}));
vi.mock("@zoeskoul/platform-server/server/runnerClient",()=>({RunnerHttpError:class RunnerHttpError extends Error{status=503;}}));
vi.mock("@/lib/build/reactPreviewServer",()=>({
 ReactPreviewRequestError:class ReactPreviewRequestError extends Error{constructor(public code:string,message:string,public status:number){super(message);}},
 parseReactPreviewId:vi.fn(v=>v),
}));
const previewId="preview_11111111-1111-4111-8111-111111111111";
const ctx={params:Promise.resolve({buildProjectId:"project_1",previewId})};
const req=()=>new Request("https://app.example/revoke",{method:"POST"});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED","true");
 vi.mocked(enforceSameOriginPost).mockReturnValue(true);
 vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValue({userId:"owner_1"} as never);
});afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E3C4B2 authenticated grant revocation",()=>{
 it("is disabled without feature flag",async()=>{
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED","false");
  expect((await POST(req(),ctx)).status).toBe(404);
  expect(loadCurrentBuildAccessSnapshot).not.toHaveBeenCalled();
 });
 it("rejects CSRF, body payload and unauthenticated callers",async()=>{
  vi.mocked(enforceSameOriginPost).mockReturnValueOnce(false);
  expect((await POST(req(),ctx)).status).toBe(403);
  expect((await POST(new Request("https://app.example/revoke",{method:"POST",body:"actorKey=evil"}),ctx)).status).toBe(400);
  vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValueOnce({userId:null} as never);
  expect((await POST(req(),ctx)).status).toBe(401);
  expect(revokeOwnedDevelopmentPreviewGrants).not.toHaveBeenCalled();
 });
 it("revokes only current owned project and preview",async()=>{
  const res=await POST(req(),ctx);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ok:true});
  expect(revokeOwnedDevelopmentPreviewGrants).toHaveBeenCalledWith({
   access:{userId:"owner_1"},buildProjectId:"project_1",previewId});
 });
});
