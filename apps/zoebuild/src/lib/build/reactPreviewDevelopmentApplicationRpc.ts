import "server-only";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { requireOwnedReactPreviewProject } from "@/lib/build/reactPreviewServer";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { checkDurablePreviewGrant } from "./reactPreviewDevelopmentDurableGrant";
import { executeTrustedDevelopmentApplicationGetAtRunner, executeTrustedDevelopmentApplicationPostAtRunner } from "./reactPreviewRunnerClient";
import { requireConfiguredDevelopmentHmrOrigin } from "./reactPreviewDevelopmentHmrTicket";
import { APPLICATION_RPC_MAX_BODY_BYTES, applicationRpcPath, applicationRpcStatus, applicationMutationPath, applicationMutationBody } from "./reactPreviewDevelopmentApplicationProtocol";

const MAX_GET_ENVELOPE_BYTES=8192;
// JSON escaping may expand the enclosed 64 KiB UTF-8 string by up to sixfold.
const MAX_POST_ENVELOPE_BYTES=400 * 1024;
function postEnabled(){return process.env.ZOEBUILD_DEVELOPMENT_APPLICATION_POST_ENABLED==="true";}
const PRIVATE_BASE=/\/api\/build\/projects\/[A-Za-z0-9_-]+\/preview\/preview_[a-f0-9-]+\/content\/[A-Za-z0-9_-]{32}/i;
const PUBLIC_MARKER="__zoebuild_dev_preview_public_base__";
const TOKEN=/^dpg1\.[A-Za-z0-9_-]{43}$/;
const PROJECT=/^[A-Za-z0-9_-]{1,128}$/;
const PREVIEW=/^preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS={"cache-control":"private, no-store, max-age=0","x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer","cross-origin-resource-policy":"same-origin","content-security-policy":"default-src 'none'"};

export function developmentApplicationRpcEnabled():boolean {
  return process.env.ZOEBUILD_DEVELOPMENT_APPLICATION_RPC_ENABLED==="true" &&
    process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED==="true" &&
    process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED==="true" &&
    process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED==="true" &&
    process.env.ZOEBUILD_NATIVE_IFRAME_HMR_ENABLED==="true" &&
    process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_HMR_TICKET_ENABLED==="true";
}
function reject(status:number) {return new Response(null,{status,headers:HEADERS});}
/** Unlike the shared helper, this check never bypasses origin validation in dev. */
export function validApplicationRpcOrigin(req:Request):boolean {
  try {
    if(req.method!=="POST")return false;
    const origin=requireConfiguredDevelopmentHmrOrigin(req.headers.get("origin"));
    if(origin.startsWith("http:") && process.env.NODE_ENV!=="development")return false;
    const site=req.headers.get("sec-fetch-site");
    return site===null || site==="same-origin";
  } catch {return false;}
}
async function readEnvelope(req:Request) {
  const MAX_ENVELOPE_BYTES=postEnabled()?MAX_POST_ENVELOPE_BYTES:MAX_GET_ENVELOPE_BYTES;
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get("content-type")??"") || !req.body)
    throw new Error("Invalid application RPC envelope.");
  const length=req.headers.get("content-length");
  if(length!==null && (!/^\d+$/.test(length)||Number(length)>MAX_ENVELOPE_BYTES))
    throw new Error("Invalid application RPC envelope.");
  const reader=req.body.getReader();const chunks:Buffer[]=[];let size=0;
  let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>undefined);},5000);
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>MAX_ENVELOPE_BYTES)throw new Error("Invalid application RPC envelope.");chunks.push(Buffer.from(value));}
    if(timedOut||req.signal.aborted)throw new Error("Invalid application RPC envelope.");
  } catch(error){void reader.cancel().catch(()=>undefined);throw error;}
  finally{clearTimeout(timeout);reader.releaseLock();}
  const body:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks,size)));
  if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("Invalid application RPC envelope.");
  const value=body as Record<string,unknown>;
  const keys=Object.keys(value).sort().join(",");
  const mutation=keys==="body,grantToken,method,path,sourceVersion"&&value.method==="POST";
  if((!mutation&&(keys!=="grantToken,path,sourceVersion"||size>MAX_GET_ENVELOPE_BYTES)) ||
    typeof value.grantToken!=="string"||!TOKEN.test(value.grantToken)||
    typeof value.sourceVersion!=="number"||!Number.isSafeInteger(value.sourceVersion)||value.sourceVersion<1||
    !applicationRpcPath(value.path))throw new Error("Invalid application RPC envelope.");
  const common={grantToken:value.grantToken,path:value.path,sourceVersion:value.sourceVersion};
  if(mutation){
    if(!postEnabled()||!applicationMutationPath(value.path)||!applicationMutationBody(value.body))
      throw new Error("Invalid application RPC envelope.");
    return {...common,method:"POST" as const,body:value.body};
  }
  return {...common,method:"GET" as const};
}
/** No response rewriting: Seroval records must stay byte-for-byte intact. */
export function validatedApplicationRpcResponse(input:unknown):Response {
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Invalid application RPC response.");
  const result=input as Record<string,unknown>;
  const headers=result.headers as Record<string,unknown>|undefined;
  if(!applicationRpcStatus(result.status)||!headers||typeof headers!=="object"||Array.isArray(headers)||
      typeof headers["content-type"]!=="string"||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(headers["content-type"])||
      headers["x-tss-serialized"]!=="true"||headers["x-tss-raw"]!==undefined||
      typeof result.bodyBase64!=="string"||result.bodyBase64.length>Math.ceil(APPLICATION_RPC_MAX_BODY_BYTES/3)*4)
    throw new Error("Invalid application RPC response.");
  const bytes=Buffer.from(result.bodyBase64,"base64");
  if(bytes.length>APPLICATION_RPC_MAX_BODY_BYTES||bytes.toString("base64")!==result.bodyBase64)
    throw new Error("Invalid application RPC response.");
  const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  const canonical=JSON.stringify(JSON.parse(text));
  if([text,canonical].some(value=>PRIVATE_BASE.test(value)||value.includes(PUBLIC_MARKER)))
    throw new Error("Invalid application RPC response.");
  return new Response(new Uint8Array(bytes),{status:result.status,headers:{...HEADERS,
    "content-type":"application/json","x-tss-serialized":"true"}});
}
/** The read grant is a lease binding, NOT authentication or execution authority.
 * Only the current editor session may dispatch the bounded application operation. */
export async function handleDevelopmentApplicationRpc(req:Request,identity:Readonly<{buildProjectId:string;previewId:string}>):Promise<Response> {
  if(!developmentApplicationRpcEnabled())return reject(404);
  if(!validApplicationRpcOrigin(req))return reject(403);
  if(!PROJECT.test(identity.buildProjectId)||!PREVIEW.test(identity.previewId))return reject(404);
  try {
    const access=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});
    const userId=access.userId;
    if(!userId)return reject(401);
    let body;
    try{body=await readEnvelope(req);}catch{return reject(400);}
    // Resolve the saved revision independently of the iframe and caller body.
    const project=await requireOwnedReactPreviewProject({access,buildProjectId:identity.buildProjectId});
    if(project.sourceVersion!==body.sourceVersion)return reject(409);
    const grantIdentity={userId,...identity,sourceVersion:body.sourceVersion};
    await checkDurablePreviewGrant(body.grantToken,grantIdentity);
    const actorKey=await requireRunnerActorKey(userId);
    if(req.signal.aborted)return reject(409);
    const command={actorKey,...identity,sourceVersion:body.sourceVersion,path:body.path};
    const result=body.method==="POST"
      ? await executeTrustedDevelopmentApplicationPostAtRunner({...command,bodyBase64:Buffer.from(body.body,"utf8").toString("base64")})
      : await executeTrustedDevelopmentApplicationGetAtRunner(command);
    if(result.sourceVersion!==body.sourceVersion)return reject(409);
    // A revoked session/grant or newer saved revision cannot release a response.
    const afterAccess=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});
    if(afterAccess.userId!==userId||req.signal.aborted)return reject(403);
    const after=await requireOwnedReactPreviewProject({access:afterAccess,buildProjectId:identity.buildProjectId});
    if(after.sourceVersion!==body.sourceVersion)return reject(409);
    await checkDurablePreviewGrant(body.grantToken,grantIdentity);
    if(req.signal.aborted)return reject(409);
    return validatedApplicationRpcResponse(result.response);
  }catch{return reject(404);}
}
