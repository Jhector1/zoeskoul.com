import { createHash } from "node:crypto";
import type { PendingHostedPublication, HostedOperationAcknowledgement } from "./hostedPublicationRecovery";

const ID=/^[A-Za-z0-9_-]{4,128}$/;
const HEX=/^[a-f0-9]{64}$/;
const TOKEN=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$/;
const MAX=9223372036854775807n;
const MAX_BYTES=56*1024*1024;
function invalid():never {throw new Error("INVALID_FENCED_PROTOCOL");}
function obj(v:unknown,keys:readonly string[]):v is Record<string,unknown>{return !!v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));}
function id(v:unknown):v is string{return typeof v==="string"&&ID.test(v);}
function hex(v:unknown):v is string{return typeof v==="string"&&HEX.test(v);}
function fence(v:unknown):bigint {if(typeof v!=="string"||! /^(0|[1-9][0-9]{0,18})$/.test(v))return invalid();const n=BigInt(v);return n<=MAX?n:invalid();}
function version(v:unknown):v is number{return typeof v==="number"&&Number.isSafeInteger(v)&&v>0&&v<=2147483647;}
export function encodeFencedOperation(op:PendingHostedPublication,bytes?:Uint8Array):Uint8Array {
  if(!id(op.operationId)||!id(op.projectId)||typeof op.expectedGeneration!=="bigint"||op.expectedGeneration<0n||op.expectedGeneration>=MAX)return invalid();
  if(op.action==="unpublish"){if(op.target!==null||bytes!==undefined)return invalid();}
  else {
    const t=op.target;
    if((op.action!=="publish"&&op.action!=="rollback")||!t||!id(t.deploymentId)||!version(t.sourceVersion)||!hex(t.artifactHash)||!hex(t.objectSha256))return invalid();
    if(op.action==="publish"?(!bytes||!bytes.byteLength||bytes.byteLength>MAX_BYTES||createHash("sha256").update(bytes).digest("hex")!==t.objectSha256):bytes!==undefined)return invalid();
  }
  const target=op.target?{deploymentId:op.target.deploymentId,sourceVersion:op.target.sourceVersion,artifactHash:op.target.artifactHash,objectSha256:op.target.objectSha256}:null;
  const header=Buffer.from(JSON.stringify({operationId:op.operationId,projectId:op.projectId,expectedGeneration:op.expectedGeneration.toString(),action:op.action,target})+"\n");
  return Buffer.concat(bytes?[header,bytes]:[header]);
}
export function parseFencedAcknowledgement(value:unknown,projectId:string):HostedOperationAcknowledgement {
  if(!id(projectId)||!value||typeof value!=="object")return invalid();
  const v=value as Record<string,unknown>;
  const base=["operationId","projectId","fence","state"];
  if(!id(v.operationId)||v.projectId!==projectId)return invalid();
  const f=fence(v.fence);if(f===0n)return invalid();
  const common={operationId:v.operationId,projectId,fence:f};
  if(v.state==="applied-inactive"&&obj(v,base))return {...common,state:"applied-inactive"};
  if(v.state!=="applied-active"||!obj(v,[...base,"activation"]))return invalid();
  const a=v.activation;
  if(!obj(a,["projectId","sourceVersion","artifactHash","objectSha256","activatedAt"])||a.projectId!==projectId||!version(a.sourceVersion)||!hex(a.artifactHash)||!hex(a.objectSha256)||typeof a.activatedAt!=="string"||!TOKEN.test(a.activatedAt)||!Number.isFinite(Date.parse(a.activatedAt)))return invalid();
  return {...common,state:"applied-active",activation:{projectId,sourceVersion:a.sourceVersion,artifactHash:a.artifactHash,objectSha256:a.objectSha256,activatedAt:a.activatedAt}};
}
export type FencedStatus=Readonly<{fence:bigint;acknowledgement:HostedOperationAcknowledgement|null}>;
export function parseFencedStatus(raw:string,projectId:string):FencedStatus {
  const v:unknown=JSON.parse(raw);
  if(!obj(v,["fence","acknowledgement"]))return invalid();
  const f=fence(v.fence);
  if(f===0n){if(v.acknowledgement!==null)return invalid();return {fence:f,acknowledgement:null};}
  const a=parseFencedAcknowledgement(v.acknowledgement,projectId);
  if(a.fence!==f)return invalid();return {fence:f,acknowledgement:a};
}
