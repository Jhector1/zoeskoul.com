import "server-only";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { productionHostedSelection, productionControlArgs } from "./hostedProductionPolicy";

const ID=/^[A-Za-z0-9_-]{4,128}$/;
const HEX=/^[a-f0-9]{64}$/;
const MAX_BYTES=56*1024*1024;
const SITE="http://127.0.0.1:33105/";

type Env=Readonly<Record<string,string|undefined>>;
export function privatePublishSelection(origin:string,projectId:string,env:Env) {
  const ownerId=env.ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER ?? "";
  if (origin!=="http://localhost:3004" || env.NODE_ENV!=="development" || env.ZOEBUILD_PUBLISH_ENABLED!=="0" || env.ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION!=="1" || !ID.test(ownerId) || !ID.test(projectId) || env.ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION_PROJECT!==projectId) return null;
  return {ownerId};
}

/** Separate, explicitly selected development hosting lane. Never selects the legacy pilot. */
function dedicatedFencedSelection(projectId:string,env:Env,projects:string[],legacyId:string):boolean {
  return env.ZOEBUILD_HOSTED_FENCED_DEV==="1" && env.ZOEBUILD_HOSTED_FENCED_DEV_PROJECT===projectId && projectId==="cmwvhcusk0002u0dlwhxh9uh2" && projectId!==legacyId && !projects.includes(projectId);
}

export function hostedPublishSelection(origin:string,projectId:string,env:Env) {
  const ownerId=env.ZOEBUILD_HOSTED_PUBLISH_DEV_OWNER ?? "";
  const legacyId=env.ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION_PROJECT ?? "";
  const projects=(env.ZOEBUILD_HOSTED_PUBLISH_DEV_PROJECTS ?? "").split(",");
  if (origin!=="http://localhost:3004" || env.NODE_ENV!=="development" || env.VERCEL_ENV==="production" || env.ZOEBUILD_PUBLISH_ENABLED!=="0" || env.ZOEBUILD_HOSTED_PUBLISH_DEV!=="1" || !ID.test(ownerId) || !ID.test(legacyId) || projects.length>2 || projects.some(id=>!ID.test(id)||id===legacyId) || new Set(projects).size!==projects.length || (!projects.includes(projectId) && !dedicatedFencedSelection(projectId,env,projects,legacyId))) return null;
  return {ownerId};
}

export function fencedInternalSelection(projectId:string,env:Env) {
  const production=productionHostedSelection(projectId,env);
  if(production)return {ownerId:production.ownerId};
  if(env.NODE_ENV!=="development"||env.ZOEBUILD_HOSTED_FENCED_DEV!=="1"||env.ZOEBUILD_HOSTED_FENCED_DEV_PROJECT!==projectId)return null;
  return hostedPublishSelection("http://localhost:3004",projectId,env);
}

export type PrivatePublishReceipt=Readonly<{deploymentId:string;sourceVersion:number;artifactHash:string;deployedAt:string;publicUrl:string;privatePilot:true}>;
type Activation={projectId:string;sourceVersion:number;objectSha256:string;artifactHash:string;bytes:Uint8Array};

export function parsePrivatePublishReceipt(raw:string,projectId:string,expected?:Pick<Activation,"sourceVersion"|"objectSha256"|"artifactHash">):PrivatePublishReceipt|null {
  const data=JSON.parse(raw) as Record<string,unknown>|null;
  if (data===null && !expected) return null;
  if (!data || data.projectId!==projectId || typeof data.objectSha256!=="string" || !HEX.test(data.objectSha256) || typeof data.artifactSha256!=="string" || !HEX.test(data.artifactSha256) || typeof data.sourceVersion!=="number" || !Number.isSafeInteger(data.sourceVersion) || data.sourceVersion<1 || typeof data.activatedAt!=="string" || !Number.isFinite(Date.parse(data.activatedAt))) throw new Error("Invalid private activation receipt");
  if (expected && (data.sourceVersion!==expected.sourceVersion || data.objectSha256!==expected.objectSha256 || data.artifactSha256!==expected.artifactHash)) throw new Error("Private activation identity mismatch");
  return {deploymentId:data.objectSha256,sourceVersion:data.sourceVersion,artifactHash:data.artifactSha256,deployedAt:data.activatedAt,publicUrl:SITE,privatePilot:true};
}

/** Development operator only. No caller-controlled command, host, image, path or shell argument. */
export async function invokePrivatePublishControl(operation:"status"|"activate",input:{projectId:string}|Activation):Promise<PrivatePublishReceipt|null> {
  if (!privatePublishSelection("http://localhost:3004",input.projectId,process.env)) throw new Error("Private publishing control disabled");
  return invokeSelectedPublishControl(operation,input);
}

/** Called only after the authenticated owner and reserved hostname checks. */
export async function invokeHostedPublishControl(operation:"status"|"activate",input:{projectId:string}|Activation):Promise<PrivatePublishReceipt|null> {
  if (!hostedPublishSelection("http://localhost:3004",input.projectId,process.env) || (process.env.ZOEBUILD_HOSTED_FENCED_DEV==="1" && process.env.ZOEBUILD_HOSTED_FENCED_DEV_PROJECT===input.projectId)) throw new Error("Hosted publishing control disabled");
  return invokeSelectedPublishControl(operation,input,input.projectId);
}

async function invokeSelectedPublishControl(operation:"status"|"activate",input:{projectId:string}|Activation,hostedProject?:string):Promise<PrivatePublishReceipt|null> {
  const activation=operation==="activate" ? input as Activation : undefined;
  if (activation && (!activation.bytes || !activation.bytes.byteLength || activation.bytes.byteLength>MAX_BYTES || !HEX.test(activation.objectSha256) || createHash("sha256").update(activation.bytes).digest("hex")!==activation.objectSha256 || !HEX.test(activation.artifactHash) || !Number.isSafeInteger(activation.sourceVersion) || activation.sourceVersion<1)) throw new Error("Invalid activation input");
  const result=await runPrivateControlCommand(operation,activation?.bytes,hostedProject);
  return parsePrivatePublishReceipt(result,input.projectId,activation);
}

async function runPrivateControlCommand(operation:"status"|"activate"|"history"|"manage"|"fenced-ack"|"fenced-apply",bytes?:Uint8Array,hostedProject?:string,productionArgs?:string[]):Promise<string> {
  // Fixed server-owned remote commands. Release ids and expected pointers travel
  // as bounded JSON over stdin, never as shell arguments.
  const commands={status:'python3 -B "$HOME/.zoeskoul/publish-pilot-tools/control.py" status',activate:'python3 -B "$HOME/.zoeskoul/publish-pilot-tools/control.py" activate',history:'python3 -B "$HOME/.zoeskoul/publish-pilot-tools/control.py" history',manage:'python3 -B "$HOME/.zoeskoul/publish-pilot-tools/control.py" manage'} as const;
  // The only interpolated field is an allowlisted, shell-safe identifier.
  if (hostedProject!==undefined && (!ID.test(hostedProject) || (!["status","activate","fenced-ack","fenced-apply"].includes(operation)))) throw new Error("Invalid hosted command");
  if(hostedProject===undefined && (operation==="fenced-ack" || operation==="fenced-apply")) throw new Error("Fenced command requires hosted project");
  const command=hostedProject===undefined ? commands[operation as keyof typeof commands] : `python3 -B "$HOME/.zoeskoul/publish-pilot-tools/${(operation==="fenced-ack" || operation==="fenced-apply") && hostedProject==="cmwvhcusk0002u0dlwhxh9uh2" ? "hosted_dedicated_fenced_control.py" : "hosted_control.py"}" ${hostedProject} ${operation}`;
  return new Promise<string>((resolve,reject)=>{
    const child=spawn("/usr/bin/ssh",productionArgs??["-T","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=10","-o","ServerAliveInterval=15","-o","ServerAliveCountMax=2","zoeskoul-dev",command],{shell:false,stdio:["pipe","pipe","ignore"]});
    let size=0; const chunks:Buffer[]=[];
    const fail=()=>{clearTimeout(timer); child.kill(); reject(new Error("Private publishing control unavailable"));};
    const timer=setTimeout(fail,(operation==="activate" || operation==="fenced-apply") ? 480_000 : operation==="manage" ? 120_000 : 30_000);
    child.on("error",fail); child.stdin.on("error",fail);
    child.stdout.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>65536)fail();else chunks.push(chunk);});
    child.on("close",code=>{clearTimeout(timer);if(code===0 && size<=65536)resolve(Buffer.concat(chunks).toString("utf8"));else reject(new Error("Private publishing control failed"));});
    child.stdin.end(bytes);
  });
}

export type PrivateRetainedRelease=Readonly<{deploymentId:string;sourceVersion:number;artifactHash:string;createdAt:string}>;
export type PrivateReleaseHistory=Readonly<{active:PrivatePublishReceipt|null;releases:readonly PrivateRetainedRelease[]}>;
export type PrivateReleaseMutation=Readonly<{action:"restore"|"unpublish";target:string|null;expected:{objectSha256:string;activatedAt:string}|null}>;

export function parsePrivateReleaseHistory(raw:string,projectId:string):PrivateReleaseHistory {
  const state=JSON.parse(raw);
  if (!state || typeof state!=="object" || !Object.hasOwn(state,"active") || !Array.isArray(state.releases) || state.releases.length>5) throw new Error("Invalid retained deployment history");
  const active=parsePrivatePublishReceipt(JSON.stringify(state.active),projectId);
  const seen=new Set<string>();
  const releases:PrivateRetainedRelease[]=state.releases.map((r:Record<string,unknown>)=>{
    if (!r || typeof r!=="object" || typeof r.createdAt!=="string" || !Number.isFinite(Date.parse(r.createdAt))) throw new Error("Invalid retained deployment date");
    const release=parsePrivatePublishReceipt(JSON.stringify({...r,activatedAt:r.createdAt}),projectId);
    if (!release || seen.has(release.deploymentId)) throw new Error("Invalid retained deployment identity");
    seen.add(release.deploymentId);
    return {deploymentId:release.deploymentId,sourceVersion:release.sourceVersion,artifactHash:release.artifactHash,createdAt:r.createdAt};
  });
  if (active && !releases.some(r=>r.deploymentId===active.deploymentId && r.sourceVersion===active.sourceVersion && r.artifactHash===active.artifactHash)) throw new Error("Active release missing from history");
  return {active,releases};
}

export async function invokePrivateReleaseManagement(projectId:string,mutation?:PrivateReleaseMutation):Promise<PrivateReleaseHistory> {
  if (!privatePublishSelection("http://localhost:3004",projectId,process.env)) throw new Error("Private publishing control disabled");
  if (mutation && ((mutation.action!=="restore" && mutation.action!=="unpublish") || (mutation.action==="restore" ? typeof mutation.target!=="string" || !HEX.test(mutation.target) : mutation.target!==null) || (mutation.expected!==null && (!HEX.test(mutation.expected.objectSha256) || mutation.expected.activatedAt.length>64 || !Number.isFinite(Date.parse(mutation.expected.activatedAt)))))) throw new Error("Invalid release management input");
  const raw=await runPrivateControlCommand(mutation?"manage":"history",mutation?Buffer.from(JSON.stringify(mutation)):undefined);
  return parsePrivateReleaseHistory(raw,projectId);
}

/** Internal, explicitly opt-in fenced development transport; no initialization or public API. */
export async function invokeHostedFencedCommand(ownerId:string,projectId:string,operation:"fenced-ack"|"fenced-apply",frame?:Uint8Array):Promise<string> {
  const selected=fencedInternalSelection(projectId,process.env);
  if (!selected || selected.ownerId!==ownerId ||
      (operation!=="fenced-ack" && operation!=="fenced-apply") ||
      (operation==="fenced-ack" ? frame!==undefined : !frame || frame.byteLength===0 || frame.byteLength>MAX_BYTES+16385))
    throw new Error("Fenced publishing control disabled or invalid");
  const production=productionHostedSelection(projectId,process.env);
  return runPrivateControlCommand(operation,frame,projectId,production?productionControlArgs(projectId,operation):undefined);
}
