import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {requireOwnedReactPreviewProject} from "./reactPreviewServer";
import {requireRunnerActorKey} from "@/lib/server/runnerActorKey";
import {proxyFetchTrustedReactDevelopmentPreviewAtRunner} from "./reactPreviewRunnerClient";
import {checkDurablePreviewGrant,renewDurablePreviewGrant,revokeDurablePreviewGrants} from "./reactPreviewDevelopmentDurableGrant";
import {renewOwnedDevelopmentPreviewGrant,revokeOwnedDevelopmentPreviewGrants} from "./reactPreviewDevelopmentDurableGrantServer";
vi.mock("server-only",()=>({}));
vi.mock("./reactPreviewServer",()=>({ReactPreviewRequestError:class ReactPreviewRequestError extends Error{
 constructor(public code:string,message:string,public status:number){super(message);}},requireOwnedReactPreviewProject:vi.fn()}));
vi.mock("@/lib/server/runnerActorKey",()=>({requireRunnerActorKey:vi.fn()}));
vi.mock("./reactPreviewRunnerClient",()=>({proxyFetchTrustedReactDevelopmentPreviewAtRunner:vi.fn()}));
vi.mock("./reactPreviewDevelopmentDurableGrant",()=>({checkDurablePreviewGrant:vi.fn(),
 renewDurablePreviewGrant:vi.fn(),revokeDurablePreviewGrants:vi.fn()}));
const identity={buildProjectId:"project_1",previewId:"preview_11111111-1111-4111-8111-111111111111"};
const input={...identity,sourceVersion:7,token:"dpg1."+"a".repeat(43),access:{userId:"owner_1"} as never};
beforeEach(()=>{
 vi.resetAllMocks();
 vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED","true");
 vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED","true");
 vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED","true");
 vi.mocked(requireOwnedReactPreviewProject).mockResolvedValue({sourceVersion:7} as never);
 vi.mocked(requireRunnerActorKey).mockResolvedValue("actor");
 vi.mocked(proxyFetchTrustedReactDevelopmentPreviewAtRunner).mockResolvedValue({
   sourceVersion:7,response:{status:200,headers:{},bodyBase64:""}} as never);
});
afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E3C4B2 authenticated grant renewal",()=>{
 it("rechecks current owner/DB, Runner lease, then atomically extends expiry",async()=>{
  await renewOwnedDevelopmentPreviewGrant(input);
  expect(checkDurablePreviewGrant).toHaveBeenCalledWith(input.token,expect.objectContaining({sourceVersion:7,userId:"owner_1"}));
  expect(proxyFetchTrustedReactDevelopmentPreviewAtRunner).toHaveBeenCalledWith({
   actorKey:"actor",buildProjectId:identity.buildProjectId,previewId:identity.previewId,
   sourceVersion:7,path:"",method:"HEAD",accept:"*/*"});
  expect(requireOwnedReactPreviewProject).toHaveBeenCalledTimes(3);
  expect(renewDurablePreviewGrant).toHaveBeenCalledTimes(1);
 });
 it("fails closed before extending on disabled mode, stale DB, or Runner mismatch",async()=>{
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED","false");
  await expect(renewOwnedDevelopmentPreviewGrant(input)).rejects.toMatchObject({status:404});
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED","true");
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValueOnce({sourceVersion:8} as never);
  await expect(renewOwnedDevelopmentPreviewGrant(input)).rejects.toMatchObject({status:409});
  vi.mocked(proxyFetchTrustedReactDevelopmentPreviewAtRunner).mockResolvedValueOnce({sourceVersion:6,response:{status:200}} as never);
  await expect(renewOwnedDevelopmentPreviewGrant(input)).rejects.toMatchObject({status:404});
  expect(renewDurablePreviewGrant).not.toHaveBeenCalled();
 });
 it("rejects post-write revision transition and only revokes owned grants",async()=>{
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValueOnce({sourceVersion:7} as never)
    .mockResolvedValueOnce({sourceVersion:7} as never).mockResolvedValueOnce({sourceVersion:8} as never);
  await expect(renewOwnedDevelopmentPreviewGrant(input)).rejects.toMatchObject({status:409});
  await revokeOwnedDevelopmentPreviewGrants({access:input.access,...identity});
  expect(revokeDurablePreviewGrants).toHaveBeenCalledWith({...identity,userId:"owner_1"});
 });
});
