import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {enforceSameOriginPost} from "@zoeskoul/platform-server/http";
import {loadCurrentBuildAccessSnapshot} from "@/lib/build/currentBuildAccess";
import {renewOwnedDevelopmentPreviewGrant} from "@/lib/build/reactPreviewDevelopmentDurableGrantServer";
import {POST} from "./route";
vi.mock("@zoeskoul/platform-server/http",()=>({enforceSameOriginPost:vi.fn()}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:vi.fn()}));
vi.mock("@/lib/build/reactPreviewDevelopmentDurableGrantServer",()=>({renewOwnedDevelopmentPreviewGrant:vi.fn()}));
vi.mock("@zoeskoul/platform-server/server/runnerClient",()=>({RunnerHttpError:class RunnerHttpError extends Error{status=503;}}));
vi.mock("@/lib/build/reactPreviewServer",()=>({
 ReactPreviewRequestError:class ReactPreviewRequestError extends Error {constructor(public code:string,message:string,public status:number){super(message);}},
 parseReactPreviewId:vi.fn(v=>v),
}));
const previewId="preview_11111111-1111-4111-8111-111111111111";
const ctx={params:Promise.resolve({buildProjectId:"project_1",previewId})};
const token="dpg1."+"a".repeat(43);
function req(body:unknown={sourceVersion:7,grantToken:token}){return new Request("https://app.example/renew",{
 method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED","true");
 vi.mocked(enforceSameOriginPost).mockReturnValue(true);
 vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValue({userId:"owner_1"} as never);
});afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E3C4B2 editor-only renewal API",()=>{
 it("is unavailable with flag disabled",async()=>{
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED","false");
  expect((await POST(req(),ctx)).status).toBe(404);
  expect(loadCurrentBuildAccessSnapshot).not.toHaveBeenCalled();
 });
 it("rejects CSRF, anonymous callers, unexpected body fields",async()=>{
  vi.mocked(enforceSameOriginPost).mockReturnValueOnce(false);
  expect((await POST(req(),ctx)).status).toBe(403);
  vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValueOnce({userId:null} as never);
  expect((await POST(req(),ctx)).status).toBe(401);
  expect((await POST(req({sourceVersion:7,grantToken:token,source:[1,2]}),ctx)).status).toBe(400);
  expect(renewOwnedDevelopmentPreviewGrant).not.toHaveBeenCalled();
 });
 it("renews scoped token without exposing a new URL",async()=>{
  const result=await POST(req(),ctx);
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ok:true,sourceVersion:7});
  expect(renewOwnedDevelopmentPreviewGrant).toHaveBeenCalledWith({
    access:{userId:"owner_1"},buildProjectId:"project_1",previewId,sourceVersion:7,token});
  expect(result.headers.get("cache-control")).toContain("no-store");
 });
});
