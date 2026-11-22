import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {requireOwnedReactPreviewProject} from "./reactPreviewServer";
import {requireRunnerActorKey} from "@/lib/server/runnerActorKey";
import {proxyFetchTrustedReactDevelopmentPreviewAtRunner} from "./reactPreviewRunnerClient";
import {lookupDurablePreviewGrant,checkDurablePreviewGrant,createDurablePreviewGrant} from "./reactPreviewDevelopmentDurableGrant";
import {readOwnedDevelopmentPreviewBrowserContent,issueOwnedDevelopmentPreviewBrowserRead} from "./reactPreviewDevelopmentBrowserRead";
vi.mock("server-only",()=>({}));
vi.mock("./reactPreviewServer",()=>({ReactPreviewRequestError:class ReactPreviewRequestError extends Error{
 constructor(public code:string,message:string,public status:number){super(message);}},requireOwnedReactPreviewProject:vi.fn()}));
vi.mock("@/lib/server/runnerActorKey",()=>({requireRunnerActorKey:vi.fn()}));
vi.mock("./reactPreviewRunnerClient",()=>({proxyFetchTrustedReactDevelopmentPreviewAtRunner:vi.fn()}));
vi.mock("./reactPreviewDevelopmentDurableGrant",()=>({lookupDurablePreviewGrant:vi.fn(),
 checkDurablePreviewGrant:vi.fn(),createDurablePreviewGrant:vi.fn()}));
const previewId="preview_11111111-1111-4111-8111-111111111111",token="dpg1."+"a".repeat(43);
const identity={userId:"owner_1",buildProjectId:"project_1",previewId,sourceVersionFloor:7,
 expiresAt:new Date(Date.now()+120000),absoluteExpiresAt:new Date(Date.now()+1_000_000),revokedAt:null,id:"f".repeat(64)};
const args={buildProjectId:"project_1",previewId,token,path:"",method:"GET" as const,accept:"*/*" as const};
beforeEach(()=>{
 vi.resetAllMocks();
 vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED","true");
 vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED","true");
 vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED","true");
 vi.mocked(lookupDurablePreviewGrant).mockResolvedValue(identity);
 vi.mocked(createDurablePreviewGrant).mockResolvedValue(token);
 vi.mocked(requireOwnedReactPreviewProject).mockResolvedValue({sourceVersion:8} as never);
 vi.mocked(requireRunnerActorKey).mockResolvedValue("actor");
 vi.mocked(proxyFetchTrustedReactDevelopmentPreviewAtRunner).mockResolvedValue({
  sourceVersion:8,response:{status:200,headers:{"content-type":"text/html"},bodyBase64:Buffer.from("<html>ok</html>").toString("base64")}});
});afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E3C4B2 durable preview asset security",()=>{
 it("does DB/token and Runner revision checks before and after content fetch",async()=>{
  const response=await readOwnedDevelopmentPreviewBrowserContent(args);
  expect(response.status).toBe(200);
  expect(checkDurablePreviewGrant).toHaveBeenCalledTimes(2);
  expect(requireOwnedReactPreviewProject).toHaveBeenCalledTimes(2);
  expect(proxyFetchTrustedReactDevelopmentPreviewAtRunner).toHaveBeenCalledWith(expect.objectContaining({sourceVersion:8}));
 });
 it("rejects foreign token identity before reading Runner",async()=>{
  vi.mocked(lookupDurablePreviewGrant).mockResolvedValueOnce({...identity,buildProjectId:"other"});
  await expect(readOwnedDevelopmentPreviewBrowserContent(args)).rejects.toMatchObject({status:404});
  expect(proxyFetchTrustedReactDevelopmentPreviewAtRunner).not.toHaveBeenCalled();
 });
 it("rejects mid-read revocation or expired DB grant after Runner fetch",async()=>{
  vi.mocked(checkDurablePreviewGrant).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("revoked"));
  await expect(readOwnedDevelopmentPreviewBrowserContent(args)).rejects.toThrow("revoked");
  expect(checkDurablePreviewGrant).toHaveBeenCalledTimes(2);
 });
 it("issues opaque durable bearer only when both read and stable flags enabled",async()=>{
  const access={userId:"owner_1"} as never;
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValue({sourceVersion:8} as never);
  const minted=await issueOwnedDevelopmentPreviewBrowserRead({access,buildProjectId:"project_1",previewId,sourceVersion:8});
  expect(minted.documentUrl).toContain(token);
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED","false");
  await expect(issueOwnedDevelopmentPreviewBrowserRead({access,buildProjectId:"project_1",previewId,sourceVersion:8}))
   .rejects.toMatchObject({status:503});
  expect(createDurablePreviewGrant).toHaveBeenCalledTimes(1);
 });
});
