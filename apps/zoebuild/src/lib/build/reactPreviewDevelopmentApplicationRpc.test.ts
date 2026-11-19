import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { requireOwnedReactPreviewProject } from "@/lib/build/reactPreviewServer";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { checkDurablePreviewGrant } from "./reactPreviewDevelopmentDurableGrant";
import { executeTrustedDevelopmentApplicationGetAtRunner, executeTrustedDevelopmentApplicationPostAtRunner } from "./reactPreviewRunnerClient";
import { handleDevelopmentApplicationRpc,validatedApplicationRpcResponse,validApplicationRpcOrigin } from "./reactPreviewDevelopmentApplicationRpc";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:vi.fn()}));
vi.mock("@/lib/build/reactPreviewServer",()=>({requireOwnedReactPreviewProject:vi.fn(),ReactPreviewRequestError:class extends Error{},parseReactPreviewId:vi.fn()}));
vi.mock("@/lib/server/runnerActorKey",()=>({requireRunnerActorKey:vi.fn()}));
vi.mock("./reactPreviewDevelopmentDurableGrant",()=>({checkDurablePreviewGrant:vi.fn()}));
vi.mock("./reactPreviewRunnerClient",()=>({executeTrustedDevelopmentApplicationGetAtRunner:vi.fn(),executeTrustedDevelopmentApplicationPostAtRunner:vi.fn(),issueTrustedReactDevelopmentHmrTicketAtRunner:vi.fn()}));
const identity={buildProjectId:"project_1",previewId:"preview_123e4567-e89b-42d3-a456-426614174000"};
const origin="https://editor.example.test";
const token="dpg1."+"a".repeat(43);
const body={grantToken:token,path:"_serverFn/abc",sourceVersion:9};
const headers={"content-type":"application/json","x-tss-serialized":"true"};
const response={status:200,headers,bodyBase64:Buffer.from('{"result":{"data":"fixture"}}').toString("base64")};
const auth=vi.mocked(loadCurrentBuildAccessSnapshot), project=vi.mocked(requireOwnedReactPreviewProject), grant=vi.mocked(checkDurablePreviewGrant), runner=vi.mocked(executeTrustedDevelopmentApplicationGetAtRunner);
function req(value:unknown=body,requestOrigin:string|null=origin,site="same-origin") {
  const h=new Headers({"content-type":"application/json","sec-fetch-site":site});if(requestOrigin!==null)h.set("origin",requestOrigin);
  return new Request(origin+"/rpc",{method:"POST",headers:h,body:JSON.stringify(value)});
}
beforeEach(()=>{
  vi.resetAllMocks();
  for(const flag of ["ZOEBUILD_DEVELOPMENT_APPLICATION_RPC_ENABLED","ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED","ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED","ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED","ZOEBUILD_NATIVE_IFRAME_HMR_ENABLED","ZOEBUILD_DEVELOPMENT_PREVIEW_HMR_TICKET_ENABLED"])vi.stubEnv(flag,"true");
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_HMR_PUBLIC_ORIGIN",origin);
  auth.mockResolvedValue({userId:"owner_1"} as never);project.mockResolvedValue({sourceVersion:9} as never);
  grant.mockResolvedValue(undefined);vi.mocked(requireRunnerActorKey).mockResolvedValue("u:"+"a".repeat(64));
  runner.mockResolvedValue({sourceVersion:9,response});
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_APPLICATION_POST_ENABLED","false");
  vi.mocked(executeTrustedDevelopmentApplicationPostAtRunner).mockResolvedValue({sourceVersion:9,response});
});
afterEach(()=>vi.unstubAllEnvs());
describe("H10P2C editor-only application RPC",()=>{
  it("is default off, before authentication",async()=>{vi.stubEnv("ZOEBUILD_DEVELOPMENT_APPLICATION_RPC_ENABLED","false");expect((await handleDevelopmentApplicationRpc(req(),identity)).status).toBe(404);expect(auth).not.toHaveBeenCalled();});
  it("rejects opaque, absent, foreign origins and cross-site metadata even in dev",async()=>{
    vi.stubEnv("NODE_ENV","development");
    for(const o of ["null",null,"https://evil.example.test"])expect((await handleDevelopmentApplicationRpc(req(body,o),identity)).status).toBe(403);
    expect((await handleDevelopmentApplicationRpc(req(body,origin,"cross-site"),identity)).status).toBe(403);expect(auth).not.toHaveBeenCalled();
  });
  it("permits exact local origin only in development",()=>{vi.stubEnv("ZOEBUILD_DEVELOPMENT_HMR_PUBLIC_ORIGIN","http://localhost:3004");vi.stubEnv("NODE_ENV","development");expect(validApplicationRpcOrigin(req(body,"http://localhost:3004"))).toBe(true);vi.stubEnv("NODE_ENV","production");expect(validApplicationRpcOrigin(req(body,"http://localhost:3004"))).toBe(false);});
  it("rejects a valid-looking resource grant without a session",async()=>{auth.mockResolvedValue({userId:null} as never);expect((await handleDevelopmentApplicationRpc(req(),identity)).status).toBe(401);expect(runner).not.toHaveBeenCalled();});
  it("rejects malformed, oversized and arbitrary URL inputs",async()=>{for(const bad of [{...body,actorKey:"evil"},{...body,path:"https://evil.test"},{...body,path:"_serverFn/x?extra=1"},{...body,path:"_serverFn/x?payload="+"x".repeat(9000)},{...body,sourceVersion:1.5}])expect((await handleDevelopmentApplicationRpc(req(bad),identity)).status).toBe(400);expect(runner).not.toHaveBeenCalled();});
  it("rejects foreign ownership, revoked grants and stale saved revisions before execution",async()=>{
    project.mockRejectedValueOnce(Error("foreign"));expect((await handleDevelopmentApplicationRpc(req(),identity)).status).toBe(404);
    grant.mockRejectedValueOnce(Error("revoked"));expect((await handleDevelopmentApplicationRpc(req(),identity)).status).toBe(404);
    project.mockResolvedValueOnce({sourceVersion:10} as never);expect((await handleDevelopmentApplicationRpc(req(),identity)).status).toBe(409);expect(runner).not.toHaveBeenCalled();
  });
  it("returns exact serialized bytes, only approved headers and never CORS",async()=>{
    const res=await handleDevelopmentApplicationRpc(req(),identity);expect(res.status).toBe(200);expect(await res.text()).toBe(Buffer.from(response.bodyBase64,"base64").toString());
    expect(res.headers.get("x-tss-serialized")).toBe("true");expect(res.headers.get("access-control-allow-origin")).toBeNull();expect(res.headers.get("set-cookie")).toBeNull();
    expect(auth).toHaveBeenCalledTimes(2);expect(grant).toHaveBeenCalledTimes(2);expect(runner).toHaveBeenCalledExactlyOnceWith({actorKey:"u:"+"a".repeat(64),...identity,sourceVersion:9,path:body.path});
  });
  it("discards in-flight results after session, grant or revision changes, without retry",async()=>{
    auth.mockResolvedValueOnce({userId:"owner_1"} as never).mockResolvedValueOnce({userId:"different"} as never);expect((await handleDevelopmentApplicationRpc(req(),identity)).status).toBe(403);
    grant.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("revoked"));expect((await handleDevelopmentApplicationRpc(req(),identity)).status).toBe(404);
    project.mockResolvedValueOnce({sourceVersion:9} as never).mockResolvedValueOnce({sourceVersion:10} as never);expect((await handleDevelopmentApplicationRpc(req(),identity)).status).toBe(409);expect(runner).toHaveBeenCalledTimes(3);
  });
  it("rejects wrong revision returned by Runner",async()=>{runner.mockResolvedValueOnce({sourceVersion:8,response});expect((await handleDevelopmentApplicationRpc(req(),identity)).status).toBe(409);expect(runner).toHaveBeenCalledTimes(1);});
  it("rejects framing, raw, redirect, malformed base64 and private capabilities",()=>{for(const bad of [{...response,status:302},{...response,headers:{...headers,"x-tss-raw":"true"}},{...response,headers:{...headers,"content-type":"application/x-tss-framed; v=1"}},{...response,bodyBase64:"bad"},{...response,bodyBase64:Buffer.from(JSON.stringify("/api/build/projects/p/preview/preview_1234/content/"+"a".repeat(32))).toString("base64")}])expect(()=>validatedApplicationRpcResponse(bad)).toThrow();});
});

describe("H10P3B authenticated mutation",()=>{
  const mutation={...body,method:"POST",body:' {"data":"é"} '};
  const post=vi.mocked(executeTrustedDevelopmentApplicationPostAtRunner);
  it("requires separate opt-in",async()=>{expect((await handleDevelopmentApplicationRpc(req(mutation),identity)).status).toBe(400);expect(post).not.toHaveBeenCalled();});
  it("preserves bytes and dispatches once",async()=>{vi.stubEnv("ZOEBUILD_DEVELOPMENT_APPLICATION_POST_ENABLED","true");expect((await handleDevelopmentApplicationRpc(req(mutation),identity)).status).toBe(200);expect(post).toHaveBeenCalledExactlyOnceWith({actorKey:"u:"+"a".repeat(64),...identity,sourceVersion:9,path:body.path,bodyBase64:Buffer.from(mutation.body).toString("base64")});expect(runner).not.toHaveBeenCalled();});
  it("rejects malformed bodies, GET query and foreign origins",async()=>{vi.stubEnv("ZOEBUILD_DEVELOPMENT_APPLICATION_POST_ENABLED","true");for(const bad of [{...mutation,body:""},{...mutation,body:"[]"},{...mutation,body:'{"data":"'+"é".repeat(32768)+'"}'},{...mutation,path:"_serverFn/abc?payload=x"},{...mutation,headers:{} }])expect((await handleDevelopmentApplicationRpc(req(bad),identity)).status).toBe(400);expect((await handleDevelopmentApplicationRpc(req(mutation,"null"),identity)).status).toBe(403);expect(post).not.toHaveBeenCalled();});
  it("does not replay an uncertain mutation",async()=>{vi.stubEnv("ZOEBUILD_DEVELOPMENT_APPLICATION_POST_ENABLED","true");post.mockRejectedValueOnce(Error("uncertain"));expect((await handleDevelopmentApplicationRpc(req(mutation),identity)).status).toBe(404);expect(post).toHaveBeenCalledTimes(1);expect(runner).not.toHaveBeenCalled();});
});
