import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { updateOwnedReactDevelopmentPreviewFromSavedSource } from
  "@/lib/build/reactPreviewDevelopmentUpdate";
import { POST } from "./route";

vi.mock("@zoeskoul/platform-server/http",()=>({enforceSameOriginPost:vi.fn()}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:vi.fn()}));
vi.mock("@/lib/build/reactPreviewDevelopmentUpdate",()=>({updateOwnedReactDevelopmentPreviewFromSavedSource:vi.fn()}));
vi.mock("@zoeskoul/platform-server/server/runnerClient",()=>({RunnerHttpError:class RunnerHttpError extends Error {
  constructor(public status=503,message="runner",public code?:string){super(message);}
}}));
vi.mock("@/lib/build/reactPreviewServer",()=>({
  ReactPreviewRequestError:class ReactPreviewRequestError extends Error {
    constructor(public code:string,message:string,public status:number){super(message);}
  },
}));
const id="preview_11111111-1111-4111-8111-111111111111";
const ctx={params:Promise.resolve({buildProjectId:"project-1",previewId:id})};
const access={userId:"owner-1"};
function req(body:unknown={sourceVersion:10}){
  return new Request(`http://localhost/api/build/projects/project-1/preview/${id}/development/update`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),
  });
}
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_WEB_ENABLED","true");
  vi.mocked(enforceSameOriginPost).mockReturnValue(true);
  vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValue(access as never);
  vi.mocked(updateOwnedReactDevelopmentPreviewFromSavedSource).mockResolvedValue({action:"updated",sourceVersion:10});
});
afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E1 saved-source revision-only browser update route",()=>{
  it("requires independent web flag",async()=>{
    vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_WEB_ENABLED","false");
    expect((await POST(req(),ctx)).status).toBe(404);
    expect(loadCurrentBuildAccessSnapshot).not.toHaveBeenCalled();
  });
  it("refuses cross-origin and anonymous requests",async()=>{
    vi.mocked(enforceSameOriginPost).mockReturnValueOnce(false);
    expect((await POST(req(),ctx)).status).toBe(403);
    vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValueOnce({userId:""} as never);
    expect((await POST(req(),ctx)).status).toBe(401);
    expect(updateOwnedReactDevelopmentPreviewFromSavedSource).not.toHaveBeenCalled();
  });
  it("accepts only a saved revision and no source overrides",async()=>{
    expect((await POST(req({sourceVersion:10,files:[{path:"/bad",content:"bad"}]}),ctx)).status).toBe(400);
    expect(updateOwnedReactDevelopmentPreviewFromSavedSource).not.toHaveBeenCalled();
    const result=await POST(req(),ctx);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ok:true,action:"updated",sourceVersion:10});
    expect(updateOwnedReactDevelopmentPreviewFromSavedSource).toHaveBeenCalledWith({
      access,buildProjectId:"project-1",previewId:id,sourceVersion:10,
    });
  });
  it("fails closed on internal saved-source or Runner failure",async()=>{
    vi.mocked(updateOwnedReactDevelopmentPreviewFromSavedSource).mockRejectedValueOnce(new Error("secret DB connection string"));
    const result=await POST(req(),ctx);
    expect(result.status).toBe(503);
    expect(JSON.stringify(await result.json())).not.toContain("secret DB connection string");
  });
  it("exposes only the bounded pre-write classification needed for safe retry",async()=>{
    const {RunnerHttpError}=await import("@zoeskoul/platform-server/server/runnerClient");
    vi.mocked(updateOwnedReactDevelopmentPreviewFromSavedSource).mockRejectedValueOnce(
      new RunnerHttpError(503,"private authority detail","UPDATE_PRE_WRITE_AUTHORITY_FAILED"));
    const result=await POST(req(),ctx);
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ok:false,code:"BUILD_PREVIEW_UPDATE_RETRYABLE",
      message:"Development preview update was not applied."});
  });
});
