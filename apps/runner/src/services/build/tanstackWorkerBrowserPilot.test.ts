import { describe,expect,it,vi } from "vitest";
import { createConnection } from "node:net";
import { once } from "node:events";
import { access } from "node:fs/promises";
import type { TanstackWorkerArtifactV1 } from "@zoeskoul/build-executor-contracts";
import { serveWorkerBrowserPilot,workerBrowserPilotEnabled } from "./tanstackWorkerBrowserPilot.js";
const sha="28bd98025eccd22a4126029fbcce7862e2885629a4a9e71b3efd8723ca40eeba";
const flag="cmwqiqnly0002eldlcafn1xjx:7:b40575ab3dccf60706a129b2088a6cc57c8facb8d4fe962fb3df817c8be0a9ca";
const b64=(s:string)=>Buffer.from(s).toString("base64");
const artifact:TanstackWorkerArtifactV1={type:"worker-bundle",serverOutputPath:"dist/server",assetsOutputPath:"dist/client",entrypoint:"index.js",sha256:sha,totalBytes:2,files:[{path:"client/assets/app.js",encoding:"base64",data:b64("js")}]};
function open(get:(path:string,accept:string)=>Promise<{status:number;headers:Record<string,string>;bodyBase64:string}>,windowMs=1200){
 let ready!:(path:string)=>void;const path=new Promise<string>(r=>{ready=r;});
 const done=serveWorkerBrowserPilot({artifact,windowMs,get,onReady:ready});return{path,done};
}
const response=(data:string)=>({status:200,headers:{"content-type":"text/javascript","set-cookie":"must-not-forward"},bodyBase64:b64(data)});
describe("U18G3 private compiled browser pilot",()=>{
 it("binds the exact artifact and existing private pilot flag",()=>{
  expect(workerBrowserPilotEnabled(sha,flag)).toBe(true);
  expect(workerBrowserPilotEnabled(sha,"wrong")).toBe(false);
  expect(workerBrowserPilotEnabled("a".repeat(64),flag)).toBe(false);
 });
 it("serves exact compiled bytes and only inert headers, then removes its socket",async()=>{
  const get=vi.fn(async()=>response("js"));const p=open(get);const path=await p.path;
  const s=createConnection(path);await once(s,"connect");
  const line=new Promise<string>(resolve=>{let text="";s.on("data",c=>{text+=c.toString();if(text.includes("\n"))resolve(text.trim());});});
  s.write(JSON.stringify({path:"/assets/app.js"})+"\n");
  expect(JSON.parse(await line)).toEqual({status:200,contentType:"text/javascript",bodyBase64:b64("js")});
  expect(get).toHaveBeenCalledWith("/assets/app.js","*/*");s.destroy();await p.done;
  await expect(access(path)).rejects.toThrow();
 });
 it.each(["/api/admin","/../secret","/assets/app.js?x=1","/_serverFn/unknown","//evil.invalid"])("rejects unapproved path %s before transport",async path=>{
  const get=vi.fn(async()=>response("js"));const p=open(get);const s=createConnection(await p.path);await once(s,"connect");
  const close=once(s,"close");s.write(JSON.stringify({path})+"\n");await close;await p.done;expect(get).not.toHaveBeenCalled();
 });
 it("rejects bytes differing from the verified artifact",async()=>{
  const p=open(async()=>response("wrong"));const s=createConnection(await p.path);await once(s,"connect");
  const close=once(s,"close");let bytes=0;s.on("data",c=>{bytes+=c.length;});s.write('{"path":"/assets/app.js"}\n');await close;await p.done;expect(bytes).toBe(0);
 });
 it("expires and removes the socket even without a connected operator",async()=>{
  const p=open(async()=>response("js"),30);const path=await p.path;await p.done;await expect(access(path)).rejects.toThrow();
 });
});
