import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {enforceSameOriginPost} from "@zoeskoul/platform-server/http";
import {loadCurrentBuildAccessSnapshot} from "@/lib/build/currentBuildAccess";
import {issueOwnedDevelopmentPreviewBrowserRead} from "@/lib/build/reactPreviewDevelopmentBrowserRead";
import {POST} from "./route";
vi.mock("@zoeskoul/platform-server/http",()=>({enforceSameOriginPost:vi.fn()}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:vi.fn()}));
vi.mock("@/lib/build/reactPreviewDevelopmentBrowserRead",()=>({issueOwnedDevelopmentPreviewBrowserRead:vi.fn()}));
vi.mock("@zoeskoul/platform-server/server/runnerClient",()=>({RunnerHttpError:class RunnerHttpError extends Error{status=503;}}));
vi.mock("@/lib/build/reactPreviewServer",()=>({
 ReactPreviewRequestError:class ReactPreviewRequestError extends Error{constructor(public code:string,message:string,public status:number){super(message);}},
 parseReactPreviewId:vi.fn(v=>v),
}));
const ctx={params:Promise.resolve({buildProjectId:"project_1",previewId:"preview_11111111-1111-4111-8111-111111111111"})};
const req=()=>new Request("https://app.example/api/build/projects/project_1/preview/foo/development/read-access",{
 method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceVersion:9}),
});
const access={userId:"owner_1"};
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED","true");
 vi.mocked(enforceSameOriginPost).mockReturnValue(true);
 vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValue(access as never);
 vi.mocked(issueOwnedDevelopmentPreviewBrowserRead).mockResolvedValue({basePath:"/safe/",documentUrl:"/safe/"});
});
afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E2B2 browser-read token issue HTTP",()=>{
 it("is completely disabled until flag is enabled",async()=>{
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED","false");
  expect((await POST(req(),ctx)).status).toBe(404);
  expect(loadCurrentBuildAccessSnapshot).not.toHaveBeenCalled();
 });
 it("rejects cross-origin and anonymous use",async()=>{
  vi.mocked(enforceSameOriginPost).mockReturnValueOnce(false);
  expect((await POST(req(),ctx)).status).toBe(403);
  vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValueOnce({userId:null} as never);
  expect((await POST(req(),ctx)).status).toBe(401);
  expect(issueOwnedDevelopmentPreviewBrowserRead).not.toHaveBeenCalled();
 });
 it("authenticates authoritatively and issues only read URL",async()=>{
  const answer=await POST(req(),ctx);
  expect(answer.status).toBe(200);
  expect(await answer.json()).toMatchObject({ok:true,basePath:"/safe/",sourceVersion:9});
  expect(loadCurrentBuildAccessSnapshot).toHaveBeenCalledWith(expect.any(Request),{requireAuthority:true});
  expect(issueOwnedDevelopmentPreviewBrowserRead).toHaveBeenCalledWith({
    access,buildProjectId:"project_1",previewId:"preview_11111111-1111-4111-8111-111111111111",sourceVersion:9,
  });
 });
});
