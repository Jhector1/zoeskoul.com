import { describe,expect,it,vi } from "vitest";
import { createHash } from "node:crypto";
import { THUMBNAIL_SECCOMP_PROFILE } from "./thumbnailSeccompProfile.js";
vi.mock("../docker/dockerClient.js",()=>({docker:{}}));
vi.mock("./sharedPreviewRegistry.js",()=>({sharedFullStackPreviews:{}}));
vi.mock("./tanstackPreviewDockerTransport.js",()=>({fetchTanstackHttpInsideSandbox:vi.fn()}));
import {parseThumbnailMessage,thumbnailContainerOptions,createThumbnailProtocol,verifyThumbnailRemoval} from "./tanstackPreviewThumbnail.js";

describe("private thumbnail worker boundary",()=>{
  it("requires an exact local image and a credential-free isolated worker",()=>{
    expect(()=>thumbnailContainerOptions("renderer:latest")).toThrow();
    const opts=thumbnailContainerOptions("sha256:"+"a".repeat(64));
    expect(opts.User).toBe("1000:1000");
    expect(opts.HostConfig).toMatchObject({NetworkMode:"none",ReadonlyRootfs:true,Privileged:false,CapDrop:["ALL"],SecurityOpt:["no-new-privileges",`seccomp=${THUMBNAIL_SECCOMP_PROFILE}`],AutoRemove:true});
    expect(opts.HostConfig).not.toHaveProperty("Binds");
    expect(opts.Env).toEqual(["HOME=/tmp","PYTHONUNBUFFERED=1","PYTHONDONTWRITEBYTECODE=1"]);
  });
  it("pins the exact sandbox profile from the successful VM fixture",()=>{
    expect(createHash("sha256").update(THUMBNAIL_SECCOMP_PROFILE).digest("hex")).toBe("2d5a038bdb9482390782c912233e30e80ebf3b7dd7bb37f25e1d3e1b283ba487");
    const profile=JSON.parse(THUMBNAIL_SECCOMP_PROFILE);
    expect(profile.defaultAction).toBe("SCMP_ACT_ERRNO");
    const allowed=profile.syscalls.filter((r:{action:string})=>r.action==="SCMP_ACT_ALLOW").flatMap((r:{names:string[]})=>r.names);
    for(const name of ["socketcall","io_uring_setup","io_uring_enter","io_uring_register"])expect(allowed).not.toContain(name);
    expect(profile.syscalls).toContainEqual({names:["unshare"],action:"SCMP_ACT_ALLOW",args:[{index:0,value:0x0e020080,valueTwo:0,op:"SCMP_CMP_MASKED_EQ"}],includes:{arches:["amd64"]}});
  });
  it("accepts only bounded relative GET relay requests",()=>{
    expect(parseThumbnailMessage('{"kind":"get","accept":"*/*","path":""}')).toEqual({kind:"get",accept:"*/*",path:""});
    expect(parseThumbnailMessage('{"kind":"get","accept":"*/*","path":"src/main.tsx?t=1"}')).toEqual({kind:"get",accept:"*/*",path:"src/main.tsx?t=1"});
    for(const path of ["https://other.invalid/","/etc/passwd","../secret","%252e%252e/x","@fs/etc/passwd","api/secret","_serverFn/foo"]){
      expect(()=>parseThumbnailMessage(JSON.stringify({kind:"get",path,accept:"*/*"}))).toThrow();
    }
    expect(()=>parseThumbnailMessage('{"kind":"get","accept":"*/*","path":"","method":"POST"}')).toThrow();
    expect(parseThumbnailMessage('{"kind":"get","path":"src/styles.css","accept":"text/css"}')).toEqual({kind:"get",path:"src/styles.css",accept:"text/css"});
    for(const accept of ["text/html","text/css,*/*","text/css\r\nCookie: x",null,{}]){
      expect(()=>parseThumbnailMessage(JSON.stringify({kind:"get",path:"src/styles.css",accept}))).toThrow();
    }
    expect(()=>parseThumbnailMessage('{"kind":"get","path":"src/styles.css"}')).toThrow();
  });
  it("requires readiness before GET and accepts it only once",()=>{
    const protocol=createThumbnailProtocol();
    expect(()=>protocol('{"kind":"get","accept":"*/*","path":""}')).toThrow();
    expect(protocol('{"kind":"ready"}')).toEqual({kind:"ready"});
    expect(()=>protocol('{"kind":"ready"}')).toThrow();
    expect(protocol('{"kind":"get","accept":"*/*","path":""}')).toEqual({kind:"get",accept:"*/*",path:""});
    expect(protocol('{"kind":"failed"}')).toEqual({kind:"failed"});
    expect(()=>protocol('{"kind":"get","accept":"*/*","path":""}')).toThrow();
    expect(()=>parseThumbnailMessage('{"kind":"ready","extra":true}')).toThrow();
  });
  it("keeps the original request budget after the handshake",()=>{
    const protocol=createThumbnailProtocol();
    protocol('{"kind":"ready"}');
    for(let i=0;i<192;i++)protocol('{"kind":"get","accept":"*/*","path":""}');
    expect(()=>protocol('{"kind":"get","accept":"*/*","path":""}')).toThrow();
  });
  it("accepts automatic cleanup only after exact absence is verified",async()=>{
    const inspect=vi.fn().mockRejectedValue({statusCode:404});
    const remove=vi.fn();
    await verifyThumbnailRemoval({inspect,remove});
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });
  it("waits through an AutoRemove conflict, then requires 404",async()=>{
    vi.useFakeTimers();
    try{
      const inspect=vi.fn().mockResolvedValue({});
      const remove=vi.fn().mockImplementation(async()=>{inspect.mockRejectedValue({statusCode:404});throw {statusCode:409};});
      const result=verifyThumbnailRemoval({inspect,remove});
      await vi.advanceTimersByTimeAsync(2500);
      await result;
      expect(remove).toHaveBeenCalledWith({force:true});
      expect(inspect.mock.calls.length).toBeGreaterThan(1);
    }finally{vi.useRealTimers();}
  });
  it("fails closed for unexpected cleanup errors",async()=>{
    const inspect=vi.fn().mockRejectedValue({statusCode:500});
    const remove=vi.fn();
    await expect(verifyThumbnailRemoval({inspect,remove})).rejects.toEqual({statusCode:500});
    expect(remove).not.toHaveBeenCalled();
  });
  it("rejects non-JPEG, malformed base64 and oversized worker outputs",()=>{
    const jpeg=Buffer.from([255,216,255,192,0,11,8,2,208,5,0,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]).toString("base64");
    const frame=JSON.stringify({kind:"jpeg",bodyBase64:jpeg});
    expect(parseThumbnailMessage(frame)).toEqual({kind:"jpeg",bodyBase64:jpeg});
    const protocol=createThumbnailProtocol();
    expect(()=>protocol(frame)).toThrow();
    protocol('{"kind":"ready"}');
    expect(()=>protocol(frame)).toThrow();
    protocol('{"kind":"get","accept":"*/*","path":""}');
    expect(protocol(frame)).toEqual({kind:"jpeg",bodyBase64:jpeg});
    expect(()=>protocol(frame)).toThrow();
    for(const bodyBase64 of ["PGh0bWw+","!!!!", "A".repeat(800000)])expect(()=>parseThumbnailMessage(JSON.stringify({kind:"jpeg",bodyBase64}))).toThrow();
  });
});
