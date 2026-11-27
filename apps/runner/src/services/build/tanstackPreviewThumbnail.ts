import { PROJECT_THUMBNAIL_MAX_BYTES, assertProjectThumbnailJpeg } from "@zoeskoul/build-executor-contracts";
import { PassThrough } from "node:stream";
import { createHash } from "node:crypto";
import { THUMBNAIL_SECCOMP_PROFILE } from "./thumbnailSeccompProfile.js";
import { docker } from "../docker/dockerClient.js";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { readOwnedTanstackDevelopmentPreview, normalizeDevelopmentPreviewRelativePath } from "./tanstackDevelopmentPreviewRead.js";

type Identity = Readonly<{ownerKey:string;buildProjectId:string;previewId:string;sourceVersion:number}>;
const MAX_JPEG=PROJECT_THUMBNAIL_MAX_BYTES;
const VERIFIED_SECCOMP_SHA256="2d5a038bdb9482390782c912233e30e80ebf3b7dd7bb37f25e1d3e1b283ba487";
const VERIFIED_DOCKER_VERSION="29.5.3";
const MAX_LINE=720*1024;
const MAX_TOTAL=32*1024*1024;
const MAX_REPLY=9*1024*1024;
const MAX_REQUESTS=192;
const RENDERER_VERSION="3";
let occupied=false;
let cleanupUnverified=false;

export function thumbnailContainerOptions(image:string) {
  if(!/^sha256:[a-f0-9]{64}$/.test(image))throw new Error("Thumbnail image must be pinned locally.");
  if(createHash("sha256").update(THUMBNAIL_SECCOMP_PROFILE,"utf8").digest("hex")!==VERIFIED_SECCOMP_SHA256)throw new Error("Thumbnail sandbox profile integrity check failed.");
  return {
    Image:image, User:"1000:1000", Entrypoint:["python","-I","-u","/opt/zoe-thumbnail/render.py"],
    Cmd:[], WorkingDir:"/tmp", Env:["HOME=/tmp","PYTHONUNBUFFERED=1","PYTHONDONTWRITEBYTECODE=1"],
    AttachStdin:true,AttachStdout:true,AttachStderr:true,OpenStdin:true,StdinOnce:false,Tty:false,
    Labels:{"com.zoeskoul.runner":"true","com.zoeskoul.runner.purpose":"project-thumbnail"},
    HostConfig:{NetworkMode:"none",ReadonlyRootfs:true,Privileged:false,CapDrop:["ALL"],
      SecurityOpt:["no-new-privileges",`seccomp=${THUMBNAIL_SECCOMP_PROFILE}`],Memory:768*1024*1024,MemorySwap:768*1024*1024,
      CpuPeriod:100000,CpuQuota:75000,PidsLimit:128,ShmSize:64*1024*1024,
      Tmpfs:{"/tmp":"rw,nosuid,nodev,size=192m,mode=1777"},AutoRemove:true,
      LogConfig:{Type:"none",Config:{}}},
  };
}

type ThumbnailMessage = {kind:"ready"}|{kind:"failed"}|{kind:"get";path:string;accept:"*/*"|"text/css"}|{kind:"jpeg";bodyBase64:string};
export function parseThumbnailMessage(line:string):ThumbnailMessage {
  const message:unknown=JSON.parse(line);
  if(!message||typeof message!=="object"||Array.isArray(message))throw new Error("Thumbnail protocol.");
  const m=message as Record<string,unknown>;
  const fields=Object.keys(m).sort().join(",");
  if(m.kind==="ready"&&fields==="kind")return {kind:"ready"};
  if(m.kind==="failed"&&fields==="kind")return {kind:"failed"};
  if(m.kind==="get"&&fields==="accept,kind,path"&&typeof m.path==="string"&&(m.accept==="*/*"||m.accept==="text/css")){
    const path=normalizeDevelopmentPreviewRelativePath(m.path);
    // No RPC or API operation is part of a thumbnail. Static resources and SSR GET only.
    const first=decodeURIComponent(path.split("?",1)[0]!.split("/",1)[0]!).toLowerCase();
    if(first==="_serverfn"||first==="api")throw new Error("Thumbnail read denied.");
    return {kind:"get",path,accept:m.accept};
  }
  if(m.kind==="jpeg"&&fields==="bodyBase64,kind"&&typeof m.bodyBase64==="string"&&m.bodyBase64.length<=Math.ceil(MAX_JPEG/3)*4){
    const b=Buffer.from(m.bodyBase64,"base64");
    if(b.toString("base64")!==m.bodyBase64)throw new Error("Invalid thumbnail image.");
    assertProjectThumbnailJpeg(b);
    return {kind:"jpeg",bodyBase64:m.bodyBase64};
  }
  throw new Error("Thumbnail protocol.");
}

/** The worker must acknowledge the private protocol before any GET or JPEG. */
export function createThumbnailProtocol() {
  let ready=false,count=0,terminal=false;
  return (line:string):ThumbnailMessage=>{
    const msg=parseThumbnailMessage(line);
    if(terminal)throw new Error("Thumbnail protocol ended.");
    if(msg.kind==="ready"){
      if(ready)throw new Error("Duplicate thumbnail readiness.");
      ready=true;
    }else if(msg.kind==="failed"){
      terminal=true;
    }else{
      if(!ready)throw new Error("Thumbnail readiness required.");
      if(msg.kind==="get"){
        if(++count>MAX_REQUESTS)throw new Error("Thumbnail relay budget.");
      }else{
        if(!count)throw new Error("Thumbnail relay required.");
        terminal=true;
      }
    }
    return msg;
  };
}

function dockerStatus(error:unknown):number|undefined {
  return error&&typeof error==="object"&&"statusCode" in error&&typeof error.statusCode==="number"?error.statusCode:undefined;
}

/** AutoRemove can race explicit removal. Only a verified 404 proves absence. */
export async function verifyThumbnailRemoval(container:Pick<Awaited<ReturnType<typeof docker.createContainer>>,"inspect"|"remove">):Promise<void> {
  const started=Date.now(), deadline=started+10_000;
  async function withinBudget<T>(operation:()=>Promise<T>):Promise<T>{
    const remaining=deadline-Date.now();
    if(remaining<=0)throw new Error("Thumbnail cleanup deadline.");
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      return await Promise.race([operation(),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error("Thumbnail cleanup deadline.")),remaining);
      })]);
    } finally {if(timer)clearTimeout(timer);}
  }
  while(Date.now()<deadline){
    try {await withinBudget(()=>container.inspect());}
    catch(error){if(dockerStatus(error)===404)return;throw error;}
    if(Date.now()-started>=2_000){
      try {await withinBudget(()=>container.remove({force:true}));}
      catch(error){if(dockerStatus(error)!==404&&dockerStatus(error)!==409)throw error;}
    }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error("Thumbnail removal not verified.");
}

/** Existing owner/revision-fenced lease only. No preview admission, writes or credentials. */
export async function captureTanstackPreviewThumbnail(identity:Identity):Promise<string> {
  if(process.env.RUNNER_EXECUTION_POOL!=="zoebuild"||process.env.ZOEBUILD_PROJECT_THUMBNAILS_ENABLED!=="true"||occupied||cleanupUnverified)throw new Error("Thumbnail unavailable.");
  const before=sharedFullStackPreviews.assertDevelopmentReadOpen(identity);
  const image=process.env.ZOEBUILD_THUMBNAIL_RENDERER_IMAGE_ID??"";
  const options=thumbnailContainerOptions(image);
  occupied=true;
  let container:Awaited<ReturnType<typeof docker.createContainer>>|undefined;
  let createAttempted=false;
  let stream:NodeJS.ReadWriteStream|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=Date.now()+40_000;
  try {
    // This policy was validated only for this dedicated daemon release and architecture.
    const engine=await docker.version();
    if(process.arch!=="x64"||engine.Version!==VERIFIED_DOCKER_VERSION||engine.Arch!=="amd64")throw new Error("Thumbnail sandbox needs revalidation for this engine.");
    const inspected=await docker.getImage(image).inspect();
    if(inspected.Id!==image||inspected.Config?.Labels?.["com.zoeskoul.thumbnail-renderer.version"]!==RENDERER_VERSION)throw new Error("Renderer image unavailable.");
    createAttempted=true;
    container=await docker.createContainer(options);
    stream=await container.attach({stream:true,stdin:true,stdout:true,stderr:true});
    const channel=stream;
    const stdout=new PassThrough(), stderr=new PassThrough();
    stderr.resume();
    const result=new Promise<string>((resolve,reject)=>{
      let buffer=Buffer.alloc(0),total=0,busy=false,finished=false;
      const accept=createThumbnailProtocol();
      const fail=()=>{if(!finished){finished=true;reject(new Error("Thumbnail unavailable."));}};
      timer=setTimeout(fail,Math.max(1,deadline-Date.now()));
      channel.on("error",fail);channel.on("close",fail);stdout.on("error",fail);stderr.on("error",fail);
      stdout.on("data",(chunk:Buffer)=>{
        if(finished)return;
        if(busy||buffer.length+chunk.length>MAX_LINE){fail();return;}
        buffer=Buffer.concat([buffer,chunk]);
        const newline=buffer.indexOf(10);if(newline<0)return;
        if(newline!==buffer.length-1){fail();return;}
        const line=buffer.toString("utf8",0,newline);buffer=Buffer.alloc(0);busy=true;
        void (async()=>{
          try {
            const msg=accept(line);
            if(msg.kind==="failed")throw new Error("Renderer failed.");
            if(msg.kind==="ready"){
              busy=false;
              channel.write('{"kind":"start"}\n',(error?:Error|null)=>{if(error)fail();});
              return;
            }
            if(msg.kind==="jpeg"){
              const after=sharedFullStackPreviews.assertDevelopmentReadOpen(identity);
              if(after.containerId!==before.containerId||after.identity.fingerprint!==before.identity.fingerprint)throw new Error();
              if(!finished){finished=true;resolve(msg.bodyBase64);}return;
            }
            if(Date.now()>=deadline)throw new Error();
            const {response}=await readOwnedTanstackDevelopmentPreview({...identity,path:msg.path,method:"GET",accept:msg.accept});
            if(finished)return;
            total+=Math.ceil(response.bodyBase64.length*3/4);
            if(total>MAX_TOTAL)throw new Error();
            const contentType=response.headers["content-type"];
            const reply=response.status===200&&contentType?{status:200,contentType,bodyBase64:response.bodyBase64}:{status:404};
            const frame=JSON.stringify(reply)+"\n";
            if(Buffer.byteLength(frame)>MAX_REPLY)throw new Error("Thumbnail reply budget.");
            busy=false;
            channel.write(frame,(error?:Error|null)=>{if(error)fail();});
          } catch {fail();}
        })();
      });
      docker.modem.demuxStream(channel,stdout,stderr);
    });
    // Attach before start so no initial GET can be lost. Always observe rejection.
    void result.catch(()=>{});
    if(Date.now()>=deadline)throw new Error("Thumbnail deadline elapsed.");
    await container.start();
    return await result;
  } finally {
    if(timer)clearTimeout(timer);
    try {(stream as (NodeJS.ReadWriteStream & {destroy?:()=>void})|undefined)?.destroy?.();}catch{/* Docker removal remains mandatory. */}
    if(createAttempted&&!container)cleanupUnverified=true;
    if(container){
      try {await verifyThumbnailRemoval(container);}
      catch {cleanupUnverified=true;}
    }
    occupied=false;
    if(cleanupUnverified)throw new Error("Thumbnail cleanup unavailable.");
  }
}
