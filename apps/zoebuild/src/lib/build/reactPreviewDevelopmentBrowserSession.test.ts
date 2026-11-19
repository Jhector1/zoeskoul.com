import { describe, expect, it, vi } from "vitest";
import { createDevelopmentPreviewBrowserSession, DevelopmentBrowserSessionError } from "./reactPreviewDevelopmentBrowserSession";

const project = "project_test";
const previewId = "preview_11111111-1111-4111-8111-111111111111";
const ROOT = `/api/build/projects/${project}/preview`;
const TOKEN = `dpv1.${"a".repeat(150)}`;
const READ = `${ROOT}/${previewId}/development/content/${TOKEN}/`;
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {status, headers:{"Content-Type":"application/json"}});
}
function driver(now = () => 0) {
  let calls = 0;
  const fetchClient = vi.fn(async (_path: string, _init: RequestInit) => {
    calls++;
    if (calls === 1) return json({ok:true,previewId,sourceVersion:7});
    if (calls === 2) return json({ok:true,documentUrl:READ,basePath:READ,sourceVersion:7});
    if (_path.endsWith("/development/update")) return json({ok:true,action:"updated",sourceVersion:8});
    return json({ok:true,documentUrl:READ,basePath:READ,sourceVersion:calls === 3 ? 7 : 8});
  });
  return {fetchClient,session:createDevelopmentPreviewBrowserSession({buildProjectId:project,fetchClient,now})};
}

describe("Phase 4E3A saved revision browser control plane", () => {
  it("starts only a saved revision, mints a scoped browser URL and updates exactly N+1", async () => {
    const {session,fetchClient} = driver();
    expect((await session.start(7)).documentUrl).toBe(READ);
    expect((await session.update(8)).sourceVersion).toBe(8);
    expect(fetchClient.mock.calls).toHaveLength(4);
    expect(fetchClient.mock.calls[0][0]).toBe(`${ROOT}/development/start`);
    expect(fetchClient.mock.calls[2][0]).toBe(`${ROOT}/${previewId}/development/update`);
    fetchClient.mock.calls.forEach(([,init], index) => {
      expect(init).toMatchObject({method:"POST",credentials:"same-origin",cache:"no-store"});
      expect(JSON.parse(String(init.body))).toEqual({sourceVersion:index < 2 ? 7 : 8});
      expect(JSON.stringify(init)).not.toContain("actorKey");
    });
  });
  it("retains the document URL across adjacent saves only with both age and opt-in",async()=>{
    vi.stubEnv("NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_URL_ENABLED","true");
    let clock=1000;
    const {session}=driver(()=>clock);
    const first=await session.start(7);
    clock+=1000;
    const next=await session.update(8);
    expect(next.documentUrl).toBe(first.documentUrl);
    expect(next.grantIssuedAt).toBe(first.grantIssuedAt);
    expect(next.sourceVersion).toBe(8);
    clock+=60_000;
    expect(session.renewalDue()).toBe(true);
    vi.unstubAllEnvs();
  });
  it("refreshes the grant rather than reusing one close to expiry",async()=>{
    vi.stubEnv("NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_URL_ENABLED","true");
    let clock=1000;
    let grantCount=0;
    const fetchClient=vi.fn(async (path:string,_init:RequestInit)=>{
      if(path.endsWith("/development/start"))return json({ok:true,previewId,sourceVersion:7});
      if(path.endsWith("/development/update"))return json({ok:true,action:"updated",sourceVersion:8});
      // Each read-access issuance must return a distinct token. Both grant
      // requests happen on even-numbered HTTP calls, so call parity cannot
      // distinguish them.
      grantCount++;
      const token=`dpv1.${(grantCount===1?"a":"b").repeat(150)}`;
      const url=`${ROOT}/${previewId}/development/content/${token}/`;
      return json({ok:true,documentUrl:url,basePath:url,sourceVersion:grantCount===1?7:8});
    });
    const session=createDevelopmentPreviewBrowserSession({buildProjectId:project,fetchClient,now:()=>clock});
    try {
      const first=await session.start(7);
      clock+=101_000;
      const second=await session.update(8);
      expect(grantCount).toBe(2);
      expect(fetchClient.mock.calls.filter(([path])=>path.endsWith("/development/read-access"))).toHaveLength(2);
      expect(fetchClient).toHaveBeenCalledTimes(4);
      expect(second.documentUrl).not.toBe(first.documentUrl);
      expect(second.grantIssuedAt).toBe(clock);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("refuses skipped revisions without forwarding an update to Runner", async () => {
    const {session,fetchClient} = driver();
    await session.start(7);
    await expect(session.update(9)).rejects.toMatchObject({code:"RESTART_REQUIRED"});
    expect(fetchClient).toHaveBeenCalledTimes(2);
    expect(session.snapshot()).toBe(null);
  });
  it("restarts a skipped revision through saved-source admission without browser source",async()=>{
    const secondPreview="preview_22222222-2222-4222-8222-222222222222";
    const secondRead=`${ROOT}/${secondPreview}/development/content/${TOKEN}/`;
    const fetchClient=vi.fn(async(path:string,init:RequestInit)=>{
      const version=JSON.parse(String(init.body)).sourceVersion;
      if(path.endsWith("/development/start"))
        return json({ok:true,previewId:version===7?previewId:secondPreview,sourceVersion:version});
      return json({ok:true,documentUrl:version===7?READ:secondRead,
        basePath:version===7?READ:secondRead,sourceVersion:version});
    });
    const session=createDevelopmentPreviewBrowserSession({buildProjectId:project,fetchClient});
    await session.start(7);
    const recovered=await session.restart(9);
    expect(recovered).toMatchObject({previewId:secondPreview,sourceVersion:9,
      documentUrl:secondRead});
    expect(fetchClient.mock.calls.filter(([path])=>path.endsWith("/development/start")))
      .toHaveLength(2);
    expect(JSON.stringify(fetchClient.mock.calls)).not.toContain("files");
  });
  it("rejects invalid versions before any HTTP request", async () => {
    const {session,fetchClient} = driver();
    await expect(session.start(1.2)).rejects.toBeInstanceOf(DevelopmentBrowserSessionError);
    await expect(session.start(0)).rejects.toMatchObject({code:"INVALID_REVISION"});
    expect(fetchClient).not.toHaveBeenCalled();
  });
  it("renews an expiring token and never sends source files or raw workspace data", async () => {
    let clock = 1000;
    const {session,fetchClient} = driver(() => clock);
    await session.start(7);
    expect(session.renewalDue()).toBe(false);
    clock += 60_000;
    expect(session.renewalDue()).toBe(true);
    await session.renew();
    expect(fetchClient.mock.calls[2][0]).toContain("/read-access");
    expect(session.renewalDue()).toBe(false);
  });
  it("rejects an arbitrary or private Runner document URL", async () => {
    const fetchClient = vi.fn().mockResolvedValueOnce(json({ok:true,previewId,sourceVersion:7}))
      .mockResolvedValueOnce(json({ok:true,sourceVersion:7,documentUrl:"https://evil.test/",basePath:"https://evil.test/"}));
    const session = createDevelopmentPreviewBrowserSession({buildProjectId:project,fetchClient});
    await expect(session.start(7)).rejects.toMatchObject({code:"UNAVAILABLE"});
    expect(session.snapshot()).toBeNull();
  });
  it("invalidates the lease after a stale update, even if the Runner wrote first", async () => {
    const fetchClient = vi.fn().mockResolvedValueOnce(json({ok:true,previewId,sourceVersion:7}))
      .mockResolvedValueOnce(json({ok:true,sourceVersion:7,documentUrl:READ,basePath:READ}))
      .mockResolvedValueOnce(json({ok:false,code:"BUILD_PREVIEW_SOURCE_CONFLICT"},409));
    const session = createDevelopmentPreviewBrowserSession({buildProjectId:project,fetchClient});
    await session.start(7);
    await expect(session.update(8)).rejects.toMatchObject({code:"RESTART_REQUIRED"});
    expect(session.snapshot()).toBe(null);
  });
  it("retains and safely retries the same lease only for a proven pre-write failure",async()=>{
    let updates=0;
    const fetchClient=vi.fn(async(path:string,init:RequestInit)=>{
      const version=JSON.parse(String(init.body)).sourceVersion;
      if(path.endsWith("/development/start"))return json({ok:true,previewId,sourceVersion:7});
      if(path.endsWith("/development/read-access"))return json({ok:true,sourceVersion:version,
        documentUrl:READ,basePath:READ});
      if(path.endsWith("/development/update")){
        updates++;
        return updates===1
          ? json({ok:false,code:"BUILD_PREVIEW_UPDATE_RETRYABLE"},503)
          : json({ok:true,action:"updated",sourceVersion:version});
      }
      return json({ok:true,sourceVersion:version,documentUrl:READ,basePath:READ});
    });
    const session=createDevelopmentPreviewBrowserSession({buildProjectId:project,fetchClient});
    await session.start(7);
    await expect(session.update(8)).rejects.toMatchObject({code:"RETRYABLE_UPDATE"});
    expect(session.snapshot()).toBeNull();
    expect(session.renewalDue()).toBe(false);
    await expect(session.update(8)).resolves.toMatchObject({previewId,sourceVersion:8});
    expect(updates).toBe(2);
    expect(fetchClient.mock.calls.filter(([path])=>path.endsWith("/development/start")))
      .toHaveLength(1);
  });
  it("never restores a closed session after delayed pre-write rejection",async()=>{
    let complete!:(value:Response)=>void;
    const fetchClient=vi.fn(async (path:string)=>{
      if(path.endsWith("/development/start"))return json({ok:true,previewId,sourceVersion:7});
      if(path.endsWith("/development/read-access"))return json({ok:true,sourceVersion:7,documentUrl:READ,basePath:READ});
      return new Promise<Response>(resolve=>{complete=resolve;});
    });
    const session=createDevelopmentPreviewBrowserSession({buildProjectId:project,fetchClient});
    await session.start(7);
    const pending=session.update(8);
    session.close();
    complete(json({ok:false,code:"BUILD_PREVIEW_UPDATE_RETRYABLE"},503));
    await expect(pending).rejects.toMatchObject({code:"CLOSED"});
    expect(session.snapshot()).toBeNull();
    await expect(session.update(8)).rejects.toMatchObject({code:"CLOSED"});
    expect(fetchClient).toHaveBeenCalledTimes(3);
  });
  it("does not retry a write after an update succeeded but grant issuance failed",async()=>{
    const fetchClient=vi.fn(async(path:string,init:RequestInit)=>{
      const version=JSON.parse(String(init.body)).sourceVersion;
      if(path.endsWith("/development/start"))return json({ok:true,previewId,sourceVersion:7});
      if(path.endsWith("/development/update"))return json({ok:true,action:"updated",sourceVersion:8});
      return version===7 ? json({ok:true,sourceVersion:7,documentUrl:READ,basePath:READ}) :
        json({ok:false,code:"BUILD_PREVIEW_UPDATE_RETRYABLE"},503);
    });
    const session=createDevelopmentPreviewBrowserSession({buildProjectId:project,fetchClient});
    await session.start(7);
    await expect(session.update(8)).rejects.toMatchObject({code:"UNAVAILABLE"});
    expect(session.snapshot()).toBeNull();
    await expect(session.update(8)).rejects.toMatchObject({code:"RESTART_REQUIRED"});
    expect(fetchClient.mock.calls.filter(([p])=>p.endsWith("/development/update"))).toHaveLength(1);
  });
  it("fails closed when its owner closes while an in-flight start is resolving", async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchClient = vi.fn(() => new Promise<Response>(resolve => {resolveFetch=resolve;}));
    const session = createDevelopmentPreviewBrowserSession({buildProjectId:project,fetchClient});
    const waiting = session.start(7);
    session.close();
    resolveFetch(json({ok:true,previewId,sourceVersion:7}));
    await expect(waiting).rejects.toMatchObject({code:"CLOSED"});
    expect(session.snapshot()).toBeNull();
    await expect(session.start(8)).rejects.toMatchObject({code:"CLOSED"});
  });
  it("rejects overlap before any duplicate mutation leaves the browser", async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchClient = vi.fn(() => new Promise<Response>(resolve => {resolveFetch=resolve;}));
    const session = createDevelopmentPreviewBrowserSession({buildProjectId:project,fetchClient});
    const waiting = session.start(7);
    await expect(session.start(7)).rejects.toMatchObject({code:"BUSY"});
    expect(fetchClient).toHaveBeenCalledTimes(1);
    resolveFetch(json({ok:false},503));
    await expect(waiting).rejects.toMatchObject({code:"UNAVAILABLE"});
  });
});
