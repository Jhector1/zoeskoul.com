import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { startOwnedReactDevelopmentPreviewFromSavedSource } from
  "@/lib/build/reactPreviewDevelopmentStart";
import { POST } from "./route";

vi.mock("@zoeskoul/platform-server/http",()=>({enforceSameOriginPost:vi.fn()}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:vi.fn()}));
vi.mock("@/lib/build/reactPreviewDevelopmentStart",()=>({startOwnedReactDevelopmentPreviewFromSavedSource:vi.fn()}));
vi.mock("@zoeskoul/platform-server/server/runnerClient",()=>({RunnerHttpError:class RunnerHttpError extends Error {status=503;}}));
vi.mock("@/lib/build/reactPreviewServer",()=>({
  ReactPreviewRequestError:class ReactPreviewRequestError extends Error {
    constructor(public code:string,message:string,public status:number){super(message);}
  },
  parseReactPreviewId:vi.fn((id:string)=>{
    if(!/^preview_[a-f0-9-]{36}$/.test(id))throw new Error("Bad ID");
    return id;
  }),
}));
const id="preview_11111111-1111-4111-8111-111111111111";
const ctx={params:Promise.resolve({buildProjectId:"project-1"})};
const access={userId:"owner-1"};
function req(body:unknown={sourceVersion:9}){
  return new Request("http://localhost/api/build/projects/project-1/preview/development/start",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),
  });
}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_WEB_ENABLED","true");
  vi.mocked(enforceSameOriginPost).mockReturnValue(true);
  vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValue(access as never);
  vi.mocked(startOwnedReactDevelopmentPreviewFromSavedSource).mockResolvedValue({
    previewId:id,buildProjectId:"project-1",sourceVersion:9,basePath:"secret-not-for-client",port:5173,
  });
});
afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E1 owner-authenticated development-start HTTP",()=>{
  it("is not available without its independent web flag",async()=>{
    vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_WEB_ENABLED","false");
    expect((await POST(req(),ctx)).status).toBe(404);
    expect(loadCurrentBuildAccessSnapshot).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and anonymous requests before starting",async()=>{
    vi.mocked(enforceSameOriginPost).mockReturnValueOnce(false);
    expect((await POST(req(),ctx)).status).toBe(403);
    vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValueOnce({userId:null} as never);
    expect((await POST(req(),ctx)).status).toBe(401);
    expect(startOwnedReactDevelopmentPreviewFromSavedSource).not.toHaveBeenCalled();
  });
  it("refuses browser source and actor overrides",async()=>{
    expect((await POST(req({sourceVersion:9,workspace:{files:[]}}),ctx)).status).toBe(400);
    expect((await POST(req({sourceVersion:9,actorKey:"attacker"}),ctx)).status).toBe(400);
    expect(startOwnedReactDevelopmentPreviewFromSavedSource).not.toHaveBeenCalled();
  });
  it("starts from saved source and never exposes basePath/capability",async()=>{
    const result=await POST(req(),ctx);
    expect(result.status).toBe(200);
    const payload=await result.json();
    expect(payload).toMatchObject({ok:true,previewId:id,sourceVersion:9});
    expect(JSON.stringify(payload)).not.toContain("secret-not-for-client");
    expect(startOwnedReactDevelopmentPreviewFromSavedSource).toHaveBeenCalledWith({
      access,buildProjectId:"project-1",sourceVersion:9,requestId:expect.any(String),
    });
  });
  it("fails closed on unexpected upstream preview identity",async()=>{
    vi.mocked(startOwnedReactDevelopmentPreviewFromSavedSource).mockResolvedValueOnce({
      previewId:id,buildProjectId:"another-project",sourceVersion:9,basePath:"secret",port:5173,
    });
    expect((await POST(req(),ctx)).status).toBe(503);
  });
});
