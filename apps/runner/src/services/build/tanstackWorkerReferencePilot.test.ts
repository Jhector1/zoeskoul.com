import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { createConnection } from "node:net";
import { once } from "node:events";
import { parseTrustedBuildJobRequest, type TanstackWorkerArtifactV1 } from "@zoeskoul/build-executor-contracts";
import { referenceOperatorAllowed, shouldRunReferenceWorkerSmoke, WORKER_REFERENCE_ACTOR, WORKER_REFERENCE_FLAG, workerSmokeConfig } from "./tanstackWorkerRuntimePolicy.js";
import { REFERENCE_BROWSER_RPC_PATH, serveWorkerBrowserPilot } from "./tanstackWorkerBrowserPilot.js";
const b64=(s:string)=>Buffer.from(s).toString("base64");
const artifact:TanstackWorkerArtifactV1={type:"worker-bundle",serverOutputPath:"dist/server",assetsOutputPath:"dist/client",entrypoint:"index.js",sha256:"a".repeat(64),totalBytes:2,files:[{path:"client/assets/app.js",encoding:"base64",data:b64("js")}]};
const reply={status:200,headers:{"content-type":"application/json","x-tss-serialized":"true","cache-control":"no-store"},bodyBase64:b64('{"value":"public"}')};
function open(referenceRpc?:()=>Promise<typeof reply>){
  let ready!:(p:string)=>void;const path=new Promise<string>(r=>{ready=r});
  const get=vi.fn(async()=>reply);
  const done=serveWorkerBrowserPilot({artifact,windowMs:1500,get,...(referenceRpc?{referenceRpc}:{}),onReady:ready});
  return {path,done,get};
}
async function closedRequest(path:string, rpc?:()=>Promise<typeof reply>){
  const p=open(rpc);const sock=createConnection(await p.path);await once(sock,"connect");
  const close=once(sock,"close");let received=0;sock.on("data",b=>{received+=b.length});
  sock.write(JSON.stringify({path})+"\n");await close;await p.done;
  expect(received).toBe(0);expect(p.get).not.toHaveBeenCalled();await expect(access(await p.path)).rejects.toThrow();
}
describe("U18G8E exact reference pilot",()=>{
  it("requires direct operator peer, actor, dedicated pool and no proxy headers",()=>{
    expect(referenceOperatorAllowed(WORKER_REFERENCE_ACTOR,"127.0.0.1",false,"zoebuild")).toBe(true);
    expect(referenceOperatorAllowed(WORKER_REFERENCE_ACTOR,"::ffff:127.0.0.1",false,"zoebuild")).toBe(true);
    expect(referenceOperatorAllowed(WORKER_REFERENCE_ACTOR,"172.20.0.3",false,"zoebuild")).toBe(false);
    expect(referenceOperatorAllowed("u:customer","127.0.0.1",false,"zoebuild")).toBe(false);
    expect(referenceOperatorAllowed(WORKER_REFERENCE_ACTOR,"127.0.0.1",true,"zoebuild")).toBe(false);
    expect(referenceOperatorAllowed(WORKER_REFERENCE_ACTOR,"127.0.0.1",false,"learning")).toBe(false);
  });
  // Exact frozen fixture remains an operator test input, not a duplicate canonical template in source control.
  it.runIf(!!process.env.ZOEBUILD_U18_REFERENCE_TEST_REQUEST)("accepts the full parsed snapshot only with the exact opt-in",()=>{
    const request=parseTrustedBuildJobRequest(JSON.parse(readFileSync(process.env.ZOEBUILD_U18_REFERENCE_TEST_REQUEST!,"utf8")));
    if(request.operation!=="production-build")throw new Error("wrong operation");
    expect(shouldRunReferenceWorkerSmoke(request,WORKER_REFERENCE_FLAG)).toBe(true);
    expect(shouldRunReferenceWorkerSmoke(request,"")).toBe(false);
    expect(shouldRunReferenceWorkerSmoke({...request,sourceVersion:2},WORKER_REFERENCE_FLAG)).toBe(false);
    expect(shouldRunReferenceWorkerSmoke({...request,buildProjectId:"other"},WORKER_REFERENCE_FLAG)).toBe(false);
    expect(shouldRunReferenceWorkerSmoke({...request,files:request.files.map((f,i)=>i?f:{...f,content:f.content+" "})},WORKER_REFERENCE_FLAG)).toBe(false);
  });
  it("does not enable RPC in the original managed asset relay",async()=>closedRequest(REFERENCE_BROWSER_RPC_PATH));
  it.each([REFERENCE_BROWSER_RPC_PATH+"?payload=x",REFERENCE_BROWSER_RPC_PATH.replace(/.$/,"0"),"/_serverFn/unknown"])("rejects unapproved reference path %s",async path=>{
    const rpc=vi.fn(async()=>reply);await closedRequest(path,rpc);expect(rpc).not.toHaveBeenCalled();
  });
  it("serves one serialized RPC reply with the exact artifact identity and then refuses repetition",async()=>{
    const rpc=vi.fn(async()=>reply);const p=open(rpc);const sock=createConnection(await p.path);await once(sock,"connect");
    const line=new Promise<string>(resolve=>{let b="";sock.on("data",c=>{b+=c.toString();if(b.includes("\n"))resolve(b.trim())});});
    sock.write(JSON.stringify({path:REFERENCE_BROWSER_RPC_PATH})+"\n");
    expect(JSON.parse(await line)).toEqual({status:200,contentType:"application/json",bodyBase64:reply.bodyBase64,serialized:true,artifactSha256:artifact.sha256});
    // Wait one turn for the server's write callback before the second request.
    const close=once(sock,"close");sock.write(JSON.stringify({path:REFERENCE_BROWSER_RPC_PATH})+"\n");await close;await p.done;
    expect(rpc).toHaveBeenCalledTimes(1);expect(p.get).not.toHaveBeenCalled();await expect(access(await p.path)).rejects.toThrow();
  });
  it("rejects nonserialized RPC replies",async()=>closedRequest(REFERENCE_BROWSER_RPC_PATH,async()=>({...reply,headers:{...reply.headers,"x-tss-serialized":"false"}})));
  it("rejects unexpected nonempty generated bindings in reference config",()=>{
    const config={main:"index.js",compatibility_date:"2026-10-01",compatibility_flags:["nodejs_compat"],assets:{directory:"../client"},jsx_factory:"React.createElement",durable_objects:{bindings:[]}};
    const withConfig=(value:object):TanstackWorkerArtifactV1=>({...artifact,files:[...artifact.files,{path:"server/wrangler.json",encoding:"base64",data:b64(JSON.stringify(value))}]});
    expect(()=>workerSmokeConfig(withConfig(config))).toThrow();
    expect(workerSmokeConfig(withConfig(config),true)).not.toHaveProperty("durable_objects");
    expect(()=>workerSmokeConfig(withConfig({...config,durable_objects:{bindings:[{name:"x"}]}}),true)).toThrow();
    expect(()=>workerSmokeConfig(withConfig({...config,kv_namespaces:[{binding:"x"}]}),true)).toThrow();
  });
});
