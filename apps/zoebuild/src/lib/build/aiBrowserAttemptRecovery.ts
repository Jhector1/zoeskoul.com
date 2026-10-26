/**
 * Short-lived pending billable AI attempt, scoped to this browser tab/project.
 * sessionStorage retains a UUID and the frozen preceding conversation only;
 * never the current prompt, pending model result, media, keys, or balances.
 * The server still owns auth, entitlement, request digest and billing settlement.
 * A stored identifier is NEVER evidence of authorization.
 */
export const AI_ATTEMPT_TTL_MS = 23 * 60 * 60 * 1000; // shorter than 24h encrypted journal
export const AI_ATTEMPT_MAX_HISTORY_CHARS = 32 * 1024;
const CAPACITY = 6;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const STORAGE_PREFIX = "zoebuild:ai-attempt:v11c:";

export type AiBrowserStorage = Pick<Storage,"getItem"|"setItem"|"removeItem">;
export type AiBrowserFileDescriptor = Readonly<{
  name:string;size:number;lastModified:number;type:string;
}>;
type Pending = Readonly<{
  version:1; id:string; fingerprint:string; createdAt:number;
  sourceVersion:number; previousInstructions:readonly string[];
  /** Exact pre-request conversation needed for byte-identical retry after reload.
   * Older pending records do not have this field and remain review-required. */
  conversation?:readonly string[];
}>;
type Envelope = {version:1; attempts:Pending[]};
export class AiBrowserAttemptError extends Error {
  constructor(readonly code:string){super(code);this.name="AiBrowserAttemptError";}
}
function key(projectId:string) {
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(projectId))
    throw new AiBrowserAttemptError("AI_ATTEMPT_PROJECT_INVALID");
  return STORAGE_PREFIX+projectId;
}
function validatedHistory(input:readonly string[]): string[] {
  if (!Array.isArray(input) || input.length>6 ||
      input.some(x=>typeof x!=="string") ||
      input.reduce((sum,x)=>sum+x.length,0)>AI_ATTEMPT_MAX_HISTORY_CHARS)
    throw new AiBrowserAttemptError("AI_ATTEMPT_CONTEXT_TOO_LARGE");
  return [...input];
}
function validatedConversation(input:readonly string[]):string[] {
  if(!Array.isArray(input)||input.length>6||input.some(s=>typeof s!=="string"||s.length>1000)||
      input.reduce((total,s)=>total+s.length,0)>6000)
    throw new AiBrowserAttemptError("AI_ATTEMPT_CONVERSATION_INVALID");
  return [...input];
}
function parse(raw:string|null): Envelope {
  if (raw===null) return {version:1,attempts:[]};
  try {
    const e:unknown=JSON.parse(raw);
    if (!e || typeof e!=="object" || (e as Envelope).version!==1 ||
        !Array.isArray((e as Envelope).attempts) || (e as Envelope).attempts.length>CAPACITY)
      throw Error("bad envelope");
    for(const item of (e as Envelope).attempts){
      if (!item || item.version!==1 || !UUID_V4.test(item.id) ||
          !HEX64.test(item.fingerprint) ||
          !Number.isSafeInteger(item.createdAt) ||
          !Number.isSafeInteger(item.sourceVersion) || item.sourceVersion<0)
        throw Error("bad record");
      validatedHistory(item.previousInstructions);
      if(item.conversation!==undefined) validatedConversation(item.conversation);
    }
    const ids=(e as Envelope).attempts.map(x=>x.id);
    if(new Set(ids).size!==ids.length) throw Error("duplicate id");
    return e as Envelope;
  } catch {
    // An unreadable record must never silently mint a new billable identity.
    throw new AiBrowserAttemptError("AI_ATTEMPT_STORAGE_REVIEW_REQUIRED");
  }
}
function read(storage:AiBrowserStorage,projectId:string):Envelope {
  try {return parse(storage.getItem(key(projectId)));}
  catch(e){
    if(e instanceof AiBrowserAttemptError)throw e;
    throw new AiBrowserAttemptError("AI_ATTEMPT_STORAGE_UNAVAILABLE");
  }
}
function write(storage:AiBrowserStorage,projectId:string,e:Envelope){
  try {
    if(e.attempts.length) storage.setItem(key(projectId),JSON.stringify(e));
    else storage.removeItem(key(projectId));
  } catch {throw new AiBrowserAttemptError("AI_ATTEMPT_STORAGE_UNAVAILABLE");}
}
async function sha256(value:string):Promise<string>{
  if(!globalThis.crypto?.subtle)throw new AiBrowserAttemptError("AI_ATTEMPT_CRYPTO_UNAVAILABLE");
  const bytes=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function getOrCreateAiBrowserAttempt(input:Readonly<{
  storage:AiBrowserStorage;projectId:string;sourceVersion:number;
  prompt:string;files:readonly AiBrowserFileDescriptor[];
  previousInstructions:readonly string[];
  conversation:readonly string[];
  now?:number; uuid?:()=>string;
}>):Promise<{id:string;previousInstructions:string[];conversation:string[]|null;recovered:boolean}>{
  const now=input.now??Date.now();
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(input.sourceVersion)||input.sourceVersion<0 ||
     typeof input.prompt!=="string"||!Array.isArray(input.files) || input.files.length>12 ||
     input.files.some(f=>!f||typeof f.name!=="string"||f.name.length>255 ||
       !Number.isSafeInteger(f.size)||f.size<0||!Number.isSafeInteger(f.lastModified)||
       typeof f.type!=="string"))
    throw new AiBrowserAttemptError("AI_ATTEMPT_INPUT_INVALID");
  const fingerprint=await sha256(JSON.stringify([
    input.projectId,input.sourceVersion,input.prompt,
    input.files.map(f=>[f.name,f.size,f.lastModified,f.type]),
  ]));
  const state=read(input.storage,input.projectId);
  const same=state.attempts.find(x=>x.fingerprint===fingerprint);
  if(same){
    if(now<same.createdAt || now-same.createdAt>=AI_ATTEMPT_TTL_MS)
      throw new AiBrowserAttemptError("AI_ATTEMPT_EXPIRED_REVIEW_REQUIRED");
    // DO NOT use the in-memory history: intent input must stay byte-identical.
    return {id:same.id,previousInstructions:validatedHistory(same.previousInstructions),
      conversation:same.conversation===undefined?null:validatedConversation(same.conversation),recovered:true};
  }
  const fresh=state.attempts.filter(x=>now>=x.createdAt && now-x.createdAt<AI_ATTEMPT_TTL_MS);
  if(fresh.length>=CAPACITY)
    throw new AiBrowserAttemptError("AI_ATTEMPT_CAPACITY_REVIEW_REQUIRED");
  const id=(input.uuid??(()=>globalThis.crypto.randomUUID()))().toLowerCase();
  if(!UUID_V4.test(id))throw new AiBrowserAttemptError("AI_ATTEMPT_UUID_INVALID");
  const previousInstructions=validatedHistory(input.previousInstructions);
  const conversation=validatedConversation(input.conversation);
  write(input.storage,input.projectId,{version:1,attempts:[...fresh,{
    version:1,id,fingerprint,createdAt:now,sourceVersion:input.sourceVersion,
    previousInstructions,conversation,
  }]});
  return {id,previousInstructions,conversation,recovered:false};
}
export function completeAiBrowserAttempt(input:Readonly<{
  storage:AiBrowserStorage;projectId:string;id:string;
}>):void {
  const state=read(input.storage,input.projectId);
  write(input.storage,input.projectId,{version:1,
    attempts:state.attempts.filter(x=>x.id!==input.id)});
}
