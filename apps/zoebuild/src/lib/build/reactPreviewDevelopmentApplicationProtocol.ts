/** Browser-safe envelope only. The Runner independently validates the decoded
 * TanStack development function ID and serialized query payload. */
export const APPLICATION_RPC_MAX_BODY_BYTES = 1024 * 1024;
export const APPLICATION_RPC_MAX_MUTATION_BYTES = 64 * 1024;
export const APPLICATION_RPC_MAX_PATH = 4096;
export const APPLICATION_RPC_ACCEPT = "application/x-tss-framed, application/x-ndjson, application/json";
export const APPLICATION_RPC_BASE = /^\/api\/build\/projects\/([A-Za-z0-9_-]{1,128})\/preview\/(preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/development\/content\/(dpg1\.[A-Za-z0-9_-]{43})\/$/i;
export function applicationRpcPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= APPLICATION_RPC_MAX_PATH &&
    !/[\\#\u0000-\u0020\u007f]/.test(value) &&
    /^_serverFn\/[A-Za-z0-9_-]{1,2048}(?:\?payload=[^&?]*)?$/.test(value);
}
/** The mutation wire accepts only JSON objects, preserved as original text. */
export function applicationMutationBody(value:unknown):value is string {
  if(typeof value!=="string"||!value.length||value.length>APPLICATION_RPC_MAX_MUTATION_BYTES)return false;
  const bytes=new TextEncoder().encode(value);
  if(bytes.length>APPLICATION_RPC_MAX_MUTATION_BYTES||new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes)!==value)return false;
  try{const parsed:unknown=JSON.parse(value);return !!parsed&&typeof parsed==="object"&&!Array.isArray(parsed);}catch{return false;}
}
export function applicationMutationPath(value:unknown):value is string {
  return applicationRpcPath(value)&&!value.includes("?");
}
export function applicationRpcIdentity(documentUrl:string) {
  const match=APPLICATION_RPC_BASE.exec(documentUrl);
  if (!match) return null;
  return {buildProjectId:match[1]!,previewId:match[2]!,grantToken:match[3]!};
}
export function applicationRpcStatus(value:unknown):value is number {
  return typeof value==="number" && Number.isInteger(value) &&
    ((value>=200 && value<300 && value!==204 && value!==205) || (value>=400 && value<=599));
}
