import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {requireOwnedReactPreviewProject} from "./reactPreviewServer";
import {requireRunnerActorKey} from "@/lib/server/runnerActorKey";
import {proxyFetchTrustedReactDevelopmentPreviewAtRunner} from "./reactPreviewRunnerClient";
import {issueDevelopmentPreviewReadToken,verifyDevelopmentPreviewReadToken} from "./reactPreviewDevelopmentReadToken";
import {issueOwnedDevelopmentPreviewBrowserRead,readOwnedDevelopmentPreviewBrowserContent} from "./reactPreviewDevelopmentBrowserRead";
vi.mock("server-only",()=>({}));
vi.mock("./reactPreviewServer",()=>({
 ReactPreviewRequestError:class ReactPreviewRequestError extends Error {
  constructor(public code:string,message:string,public status:number){super(message);}
 },requireOwnedReactPreviewProject:vi.fn(),
}));
vi.mock("@/lib/server/runnerActorKey",()=>({requireRunnerActorKey:vi.fn()}));
vi.mock("./reactPreviewRunnerClient",()=>({proxyFetchTrustedReactDevelopmentPreviewAtRunner:vi.fn()}));
vi.mock("./reactPreviewDevelopmentReadToken",()=>({issueDevelopmentPreviewReadToken:vi.fn(),verifyDevelopmentPreviewReadToken:vi.fn()}));
const previewId="preview_11111111-1111-4111-8111-111111111111";
const claims={userId:"owner_1",previewId,buildProjectId:"project_1",sourceVersion:9,expiresAt:Date.now()+100_000};
const input={buildProjectId:"project_1",previewId,sourceVersion:9,access:{userId:"owner_1"} as never};
const token="dpv1."+"a".repeat(110);
const readArgs={buildProjectId:"project_1",previewId,token,path:"",method:"GET" as const,accept:"*/*" as const};
beforeEach(()=>{
 vi.resetAllMocks();
 vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED","true");
 vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_KEY","key");
 vi.mocked(requireOwnedReactPreviewProject).mockResolvedValue({sourceVersion:9} as never);
 vi.mocked(issueDevelopmentPreviewReadToken).mockReturnValue(token);
 vi.mocked(verifyDevelopmentPreviewReadToken).mockReturnValue(claims);
 vi.mocked(requireRunnerActorKey).mockResolvedValue("u:"+"a".repeat(64));
 vi.mocked(proxyFetchTrustedReactDevelopmentPreviewAtRunner).mockResolvedValue({sourceVersion:9,response:{status:200,headers:{"content-type":"text/html"},bodyBase64:Buffer.from("<html></html>").toString("base64")}});
});
afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E2B2 authenticated browser-read gateway",()=>{
 it("does not mint a token when disabled",async()=>{
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED","false");
  await expect(issueOwnedDevelopmentPreviewBrowserRead(input)).rejects.toMatchObject({status:404});
  expect(requireOwnedReactPreviewProject).not.toHaveBeenCalled();
 });
 it("issues only current owned revision, no private Vite base",async()=>{
  const result=await issueOwnedDevelopmentPreviewBrowserRead(input);
  expect(result.documentUrl).toContain(token);
  expect(result.documentUrl).not.toContain("/content/"+"C".repeat(32));
  expect(requireOwnedReactPreviewProject).toHaveBeenCalledWith({access:input.access,buildProjectId:"project_1"});
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValueOnce({sourceVersion:10} as never);
  await expect(issueOwnedDevelopmentPreviewBrowserRead(input)).rejects.toMatchObject({status:409});
 });
 it("rechecks owner and revision on every asset request, also rechecks Runner sourceVersion",async()=>{
  const result=await readOwnedDevelopmentPreviewBrowserContent(readArgs);
  expect(result.status).toBe(200);
  expect(proxyFetchTrustedReactDevelopmentPreviewAtRunner).toHaveBeenCalledWith({
    actorKey:"u:"+"a".repeat(64),buildProjectId:"project_1",previewId,sourceVersion:9,path:"",method:"GET",accept:"*/*",
  });
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValueOnce({sourceVersion:10} as never);
  await expect(readOwnedDevelopmentPreviewBrowserContent(readArgs)).rejects.toMatchObject({status:404});
  expect(requireOwnedReactPreviewProject).toHaveBeenCalledTimes(3);
 });
 it("permits only forward current-lease reads with an explicit stable-grant flag",async()=>{
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED","true");
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValue({sourceVersion:10} as never);
  vi.mocked(proxyFetchTrustedReactDevelopmentPreviewAtRunner).mockResolvedValue({
    sourceVersion:10,response:{status:200,headers:{"content-type":"text/html"},bodyBase64:Buffer.from("<html>new</html>").toString("base64")},
  });
  expect((await readOwnedDevelopmentPreviewBrowserContent(readArgs)).status).toBe(200);
  expect(proxyFetchTrustedReactDevelopmentPreviewAtRunner).toHaveBeenCalledWith(
    expect.objectContaining({sourceVersion:10,previewId,buildProjectId:"project_1"}));
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValue({sourceVersion:8} as never);
  await expect(readOwnedDevelopmentPreviewBrowserContent(readArgs)).rejects.toMatchObject({status:404});
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValueOnce({sourceVersion:10} as never)
    .mockResolvedValueOnce({sourceVersion:11} as never);
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValue({sourceVersion:11} as never);
  // The two different DB checks must reject concurrent source transitions.
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValueOnce({sourceVersion:10} as never);
  await expect(readOwnedDevelopmentPreviewBrowserContent(readArgs)).rejects.toMatchObject({status:404});
 });
 it("fails closed when the Runner has not committed the current DB revision",async()=>{
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED","true");
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValue({sourceVersion:10} as never);
  await expect(readOwnedDevelopmentPreviewBrowserContent(readArgs)).rejects.toMatchObject({status:404});
 });
 it("fails closed on foreign token identity, expired token and service loss",async()=>{
  vi.mocked(verifyDevelopmentPreviewReadToken).mockReturnValueOnce({...claims,buildProjectId:"project_other"});
  await expect(readOwnedDevelopmentPreviewBrowserContent(readArgs)).rejects.toMatchObject({status:404});
  vi.mocked(verifyDevelopmentPreviewReadToken).mockImplementationOnce(()=>{throw new Error("expired");});
  await expect(readOwnedDevelopmentPreviewBrowserContent(readArgs)).rejects.toThrow();
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED","false");
  await expect(readOwnedDevelopmentPreviewBrowserContent(readArgs)).rejects.toMatchObject({status:404});
 });
});
