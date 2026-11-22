import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {createOwnedReactPreviewBuildRequestFromSavedSource} from "./reactPreviewServer";
import {requireRunnerActorKey} from "@/lib/server/runnerActorKey";
import {startTrustedReactDevelopmentPreviewAtRunner} from "./reactPreviewRunnerClient";
import {startOwnedReactDevelopmentPreviewFromSavedSource} from "./reactPreviewDevelopmentStart";

vi.mock("server-only",()=>({}));
vi.mock("./reactPreviewServer",()=>({
  ReactPreviewRequestError:class ReactPreviewRequestError extends Error {
    constructor(public code:string,message:string,public status:number){super(message);}
  },
  createOwnedReactPreviewBuildRequestFromSavedSource:vi.fn(),
}));
vi.mock("@/lib/server/runnerActorKey",()=>({requireRunnerActorKey:vi.fn()}));
vi.mock("./reactPreviewRunnerClient",()=>({startTrustedReactDevelopmentPreviewAtRunner:vi.fn()}));
const access={userId:"owner-1"} as never;
const req={buildProjectId:"build-project",sourceVersion:4,files:[]};
const preview={previewId:"preview-id",basePath:"/",sourceVersion:4};
beforeEach(()=>{
  vi.resetAllMocks();
  vi.spyOn(console,"warn").mockImplementation(()=>{});
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_START_ENABLED","true");
  vi.mocked(createOwnedReactPreviewBuildRequestFromSavedSource).mockResolvedValue(req as never);
  vi.mocked(requireRunnerActorKey).mockResolvedValue(`u:${"a".repeat(64)}`);
  vi.mocked(startTrustedReactDevelopmentPreviewAtRunner).mockResolvedValue(preview as never);
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe("Phase 4D server-only DB-authoritative development start",()=>{
  it("refuses disabled start before any DB or Runner call",async()=>{
    vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_START_ENABLED","false");
    await expect(startOwnedReactDevelopmentPreviewFromSavedSource({access,buildProjectId:"build-project",sourceVersion:4}))
      .rejects.toMatchObject({code:"BUILD_PREVIEW_UNAVAILABLE",status:503});
    expect(createOwnedReactPreviewBuildRequestFromSavedSource).not.toHaveBeenCalled();
    expect(startTrustedReactDevelopmentPreviewAtRunner).not.toHaveBeenCalled();
  });
  it("rejects anonymous access",async()=>{
    await expect(startOwnedReactDevelopmentPreviewFromSavedSource({access:{userId:""} as never,
      buildProjectId:"build-project",sourceVersion:4}))
      .rejects.toMatchObject({code:"BUILD_AUTH_REQUIRED",status:401});
    expect(startTrustedReactDevelopmentPreviewAtRunner).not.toHaveBeenCalled();
  });
  it("sends only authoritative saved source and derived actor identity",async()=>{
    await expect(startOwnedReactDevelopmentPreviewFromSavedSource({access,buildProjectId:"build-project",sourceVersion:4}))
      .resolves.toEqual(preview);
    expect(createOwnedReactPreviewBuildRequestFromSavedSource).toHaveBeenCalledWith({access,
      buildProjectId:"build-project",sourceVersion:4});
    expect(startTrustedReactDevelopmentPreviewAtRunner).toHaveBeenCalledWith({
      actorKey:`u:${"a".repeat(64)}`,request:req,requestId:undefined});
  });
  it("never submits a stale or unapproved saved source",async()=>{
    vi.mocked(createOwnedReactPreviewBuildRequestFromSavedSource).mockRejectedValue(new Error("stale"));
    await expect(startOwnedReactDevelopmentPreviewFromSavedSource({access,buildProjectId:"build-project",sourceVersion:3}))
      .rejects.toThrow("stale");
    expect(startTrustedReactDevelopmentPreviewAtRunner).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("ZOEBUILD development preview start failed",{
      requestId:"unavailable",stage:"saved_source",category:"unexpected",status:null,
    });
  });
});
