import type { TanstackWorkerArtifactV1 } from "@zoeskoul/build-executor-contracts";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const PILOT_FLAG = "cmwqiqnly0002eldlcafn1xjx:7:b40575ab3dccf60706a129b2088a6cc57c8facb8d4fe962fb3df817c8be0a9ca";
const PILOT_ARTIFACT = "28bd98025eccd22a4126029fbcce7862e2885629a4a9e71b3efd8723ca40eeba";
export const WORKER_BROWSER_PILOT_MAX_MS = 45_000;
const MAX_REQUESTS = 48;
const MAX_REPLY_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

type Reply = Readonly<{status:number;headers:Readonly<Record<string,string>>;bodyBase64:string}>;
export function workerBrowserPilotEnabled(sha:string, flag=process.env.ZOEBUILD_U18_PRIVATE_RUNTIME):boolean {
  return sha===PILOT_ARTIFACT && flag===PILOT_FLAG;
}

/** Operator-only, one-connection, GET-only pilot. No TCP port, new API route,
 * browser credentials, or generated-code access to the Runner's socket.
 * The caller retains its original cleanup journal and hard deadline. */
export async function serveWorkerBrowserPilot(input:Readonly<{
  artifact:TanstackWorkerArtifactV1; windowMs:number;
  get:(path:string,accept:string)=>Promise<Reply>;
  onReady?:(socketPath:string)=>void;
}>):Promise<void> {
  if(!Number.isSafeInteger(input.windowMs)||input.windowMs<1||input.windowMs>WORKER_BROWSER_PILOT_MAX_MS)
    throw new Error("Invalid browser pilot window.");
  const deadline=performance.now()+input.windowMs;
  const assets=new Map(input.artifact.files.filter(f=>/^client\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(f.path) && !f.path.split("/").some(s=>s==="."||s===".."))
    .map(f=>["/"+f.path.slice(7),f] as const));
  const dir=await mkdtemp("/tmp/zoebuild-u18g3-"); // exclusive private directory (0700)
  const socketPath=join(dir,"relay.sock");
  let active:Socket|undefined;
  let closed=false, claimed=false, busy=false, count=0,total=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let finish!:()=>void;
  const done=new Promise<void>(resolve=>{finish=resolve;});
  const stop=()=>{if(!closed){closed=true;active?.destroy();finish();}};
  const server=createServer(socket=>{
    socket.on("error",()=>{if(active===socket)stop();});
    if(closed||claimed){socket.destroy();return;}
    claimed=true;active=socket;
    socket.on("close",stop);
    socket.on("data",(chunk:Buffer)=>{
      // A single bounded line per sequential request. The trusted SSH client
      // waits for the response before issuing another one. Never queue data.
      if(closed||busy||chunk.length>4096){stop();return;}
      buffer=Buffer.concat([buffer,chunk]);
      if(buffer.length>4096){stop();return;}
      const i=buffer.indexOf(10);if(i<0)return;
      if(i!==buffer.length-1){stop();return;}
      const line=buffer.toString("utf8",0,i);buffer=Buffer.alloc(0);busy=true;
      void (async()=>{
        try {
          const raw:unknown=JSON.parse(line);
          if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).join(",")!=="path"||!("path" in raw)||typeof raw.path!=="string")throw new Error();
          const path=raw.path;
          const asset=assets.get(path);
          if(!asset&&path!=="/"&&path!=="/about"&&path!=="/api/health")throw new Error();
          if(++count>MAX_REQUESTS)throw new Error();
          const reply=await input.get(path,asset?"*/*":path==="/api/health"?"application/json":"text/html");
          if(closed)return;
          const mime=reply.headers["content-type"];
          if(reply.status!==200||typeof mime!=="string"||!mime||mime.length>180||/[^\x20-\x7e]/.test(mime)||typeof reply.bodyBase64!=="string"||reply.bodyBase64.length>Math.ceil(MAX_REPLY_BYTES/3)*4)throw new Error();
          const data=Buffer.from(reply.bodyBase64,"base64");
          if(data.length>MAX_REPLY_BYTES||data.toString("base64")!==reply.bodyBase64||(asset&&reply.bodyBase64!==asset.data))throw new Error();
          total+=data.length;if(total>MAX_TOTAL_BYTES)throw new Error();
          const encoded=JSON.stringify({status:200,contentType:mime,bodyBase64:reply.bodyBase64})+"\n";
          // Do not allow another request before the bounded response flushes.
          socket.write(encoded,()=>{busy=false;});
        } catch {stop();}
      })();
    });
    let buffer:Buffer=Buffer.alloc(0);
  });
  server.maxConnections=2;
  try {
    await new Promise<void>((resolve,reject)=>{
      server.once("error",reject);server.listen(socketPath,()=>{server.removeListener("error",reject);resolve();});
    });
    server.on("error",stop);
    const remaining=Math.floor(deadline-performance.now());
    if(remaining<=0)return;
    timer=setTimeout(stop,remaining);
    input.onReady?.(socketPath);
    await done;
  } finally {
    if(timer)clearTimeout(timer);
    stop();
    if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(dir,{recursive:true,force:true});
  }
}
