import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {createOwnedReactPreviewBuildRequestFromSavedSource} from "./reactPreviewServer";
import {requireRunnerActorKey} from "@/lib/server/runnerActorKey";
import {updateTrustedReactDevelopmentPreviewAtRunner} from "./reactPreviewRunnerClient";
import {updateOwnedReactDevelopmentPreviewFromSavedSource} from "./reactPreviewDevelopmentUpdate";

vi.mock("server-only",()=>({}));
vi.mock("./reactPreviewServer",()=>({
  ReactPreviewRequestError:class ReactPreviewRequestError extends Error {
    constructor(public code:string,message:string,public status:number){super(message);}
  },
  parseReactPreviewId:vi.fn((value:unknown)=>{
    if(typeof value!=="string" || !/^preview_[a-f0-9-]{36}$/.test(value))throw new Error("invalid preview");
    return value;
  }),
  createOwnedReactPreviewBuildRequestFromSavedSource:vi.fn(),
}));
vi.mock("@/lib/server/runnerActorKey",()=>({requireRunnerActorKey:vi.fn()}));
vi.mock("./reactPreviewRunnerClient",()=>({updateTrustedReactDevelopmentPreviewAtRunner:vi.fn()}));
const id="preview_11111111-1111-4111-8111-111111111111";
const access={userId:"owner-1"} as never;
const request={operation:"production-build",buildProjectId:"project-1",sourceVersion:9};
const update=(overrides:Record<string,unknown>={})=>updateOwnedReactDevelopmentPreviewFromSavedSource({
  access,buildProjectId:"project-1",previewId:id,sourceVersion:9,...overrides,
} as never);
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_UPDATE_ENABLED","true");
  vi.mocked(createOwnedReactPreviewBuildRequestFromSavedSource).mockResolvedValue(request as never);
  vi.mocked(requireRunnerActorKey).mockResolvedValue(`u:${"a".repeat(64)}`);
  vi.mocked(updateTrustedReactDevelopmentPreviewAtRunner).mockResolvedValue({action:"updated",sourceVersion:9});
});
afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E1 saved-source development update bridge",()=>{
  it("refuses disabled updates before accessing DB",async()=>{
    vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_UPDATE_ENABLED","false");
    await expect(update()).rejects.toMatchObject({status:503});
    expect(createOwnedReactPreviewBuildRequestFromSavedSource).not.toHaveBeenCalled();
  });
  it("rejects anonymous and invalid IDs without Runner submission",async()=>{
    await expect(update({access:{userId:""}})).rejects.toMatchObject({status:401});
    await expect(update({previewId:"wrong"})).rejects.toThrow();
    expect(updateTrustedReactDevelopmentPreviewAtRunner).not.toHaveBeenCalled();
  });
  it("sends only saved DB bytes and server-derived actor identity",async()=>{
    await expect(update()).resolves.toEqual({action:"updated",sourceVersion:9});
    expect(createOwnedReactPreviewBuildRequestFromSavedSource).toHaveBeenCalledWith({
      access,buildProjectId:"project-1",sourceVersion:9,
    });
    expect(updateTrustedReactDevelopmentPreviewAtRunner).toHaveBeenCalledWith({
      actorKey:`u:${"a".repeat(64)}`,previewId:id,request,
    });
  });
  it("fails closed on stale DB saved source and mismatched Runner acknowledgement",async()=>{
    vi.mocked(createOwnedReactPreviewBuildRequestFromSavedSource).mockRejectedValueOnce(new Error("stale"));
    await expect(update()).rejects.toThrow("stale");
    expect(updateTrustedReactDevelopmentPreviewAtRunner).not.toHaveBeenCalled();
    vi.mocked(updateTrustedReactDevelopmentPreviewAtRunner).mockResolvedValueOnce({action:"updated",sourceVersion:8});
    await expect(update()).rejects.toMatchObject({status:502});
  });
});
