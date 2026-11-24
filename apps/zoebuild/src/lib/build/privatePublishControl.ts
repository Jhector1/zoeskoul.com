import "server-only";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

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
  const activation=operation==="activate" ? input as Activation : undefined;
  if (activation && (!activation.bytes || !activation.bytes.byteLength || activation.bytes.byteLength>MAX_BYTES || !HEX.test(activation.objectSha256) || createHash("sha256").update(activation.bytes).digest("hex")!==activation.objectSha256 || !HEX.test(activation.artifactHash) || !Number.isSafeInteger(activation.sourceVersion) || activation.sourceVersion<1)) throw new Error("Invalid activation input");
  const command=operation==="activate" ? 'python3 -B "$HOME/.zoeskoul/publish-pilot-tools/control.py" activate' : 'python3 -B "$HOME/.zoeskoul/publish-pilot-tools/control.py" status';
  const result=await new Promise<string>((resolve,reject)=>{
    const child=spawn("/usr/bin/ssh",["-T","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=10","-o","ServerAliveInterval=15","-o","ServerAliveCountMax=2","zoeskoul-dev",command],{shell:false,stdio:["pipe","pipe","ignore"]});
    let size=0; const chunks:Buffer[]=[];
    const fail=()=>{clearTimeout(timer); child.kill(); reject(new Error("Private publishing control unavailable"));};
    const timer=setTimeout(fail,operation==="activate" ? 480_000 : 30_000);
    child.on("error",fail); child.stdin.on("error",fail);
    child.stdout.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>65536)fail();else chunks.push(chunk);});
    child.on("close",code=>{clearTimeout(timer);if(code===0 && size<=65536)resolve(Buffer.concat(chunks).toString("utf8"));else reject(new Error("Private publishing control failed"));});
    child.stdin.end(activation?.bytes);
  });
  return parsePrivatePublishReceipt(result,input.projectId,activation);
}
