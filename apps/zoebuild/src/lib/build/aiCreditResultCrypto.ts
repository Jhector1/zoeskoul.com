import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AiJsonTextResult } from "@zoeskoul/ai-json";

/** Encrypted, deliberately short-lived RESULT evidence. Financial truth stays in
 * AiCreditReservation/AiCreditProviderRequest. This is not a second ledger.
 * Compiled model/operational pricing approval is independent and still mandatory.
 */
export class AiCreditResultError extends Error {
  constructor(readonly code: string) { super(code); this.name = "AiCreditResultError"; }
}
export const AI_RESULT_TTL_MS = 24 * 60 * 60 * 1000;
export const AI_RESULT_MAX_BYTES = 128 * 1024;
export type AiCreditResultKeyId = "v1" | "v2" | "v3";
const SUPPORTED_KEY_IDS = ["v1", "v2", "v3"] as const;
export type AiCreditResultKeyring = Readonly<{
  activeKeyId: AiCreditResultKeyId;
  keys: Readonly<Partial<Record<AiCreditResultKeyId, Buffer>>>;
}>;
/** Phase rotation: keep v1 available to decrypt existing unexpired results,
 * configure v2 and switch the active writer only after both keys are deployed.
 * V3 is a NEW independent writer identity when v1/v2 historical keys are lost.
 * Old ciphertext is not decrypted using v3: recovery fails closed for old key IDs. */
export function aiCreditResultKeyring(input: Readonly<{
  v1?: string; v2?: string; v3?: string; activeKeyId?: string;
}>): AiCreditResultKeyring {
  const activeKeyId=input.activeKeyId??"v1";
  if (!SUPPORTED_KEY_IDS.some(id=>id===activeKeyId))
    throw new AiCreditResultError("AI_RESULT_ACTIVE_KEY_ID_INVALID");
  if (input.v2 && !input.v1 && !input.v3)
    throw new AiCreditResultError("AI_RESULT_V1_KEY_RETAIN_UNTIL_AUDIT");
  const keys: Partial<Record<AiCreditResultKeyId, Buffer>> = {};
  if (input.v1) keys.v1=aiCreditResultKey(input.v1);
  if (input.v2) keys.v2=aiCreditResultKey(input.v2);
  if (input.v3) keys.v3=aiCreditResultKey(input.v3);
  if (!keys[activeKeyId as AiCreditResultKeyId])
    throw new AiCreditResultError("AI_RESULT_ACTIVE_KEY_MISSING");
  for (const first of SUPPORTED_KEY_IDS) for (const second of SUPPORTED_KEY_IDS) {
    if (first !== second && keys[first] && keys[second] && keys[first].equals(keys[second]))
      throw new AiCreditResultError("AI_RESULT_KEY_ROTATION_REQUIRES_DISTINCT_KEY");
  }
  return {activeKeyId:activeKeyId as AiCreditResultKeyId,keys};
}
export type AiCreditSealedResult = Readonly<{
  keyId: string; nonce: string; tag: string; ciphertext: string; contentSha256: string;
}>;
export type AiCreditResultIdentity = Readonly<{
  userId: string; idempotencyKey: string; requestSha256: string; providerResponseId: string;
}>;
export function aiCreditResultKey(secret: string | undefined): Buffer {
  if (typeof secret !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(secret))
    throw new AiCreditResultError("AI_RESULT_ENCRYPTION_KEY_REQUIRED");
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32 || key.toString("base64") !== secret)
    throw new AiCreditResultError("AI_RESULT_ENCRYPTION_KEY_INVALID");
  return key;
}
function aad(id: AiCreditResultIdentity, keyId: AiCreditResultKeyId): Buffer {
  if (!id.userId || !id.idempotencyKey || !/^[a-f0-9]{64}$/.test(id.requestSha256) ||
      !id.providerResponseId || [id.userId,id.idempotencyKey,id.providerResponseId].some(v=>v.length>160))
    throw new AiCreditResultError("AI_RESULT_IDENTITY_INVALID");
  return Buffer.from(JSON.stringify([keyId,id.userId,id.idempotencyKey,id.requestSha256,id.providerResponseId]));
}
function canonicalResult(result: AiJsonTextResult): AiJsonTextResult {
  if (typeof result.text !== "string" || !result.metadata || !result.usage)
    throw new AiCreditResultError("AI_RESULT_PAYLOAD_INVALID");
  const usage=result.usage, m=result.metadata;
  if (!Number.isSafeInteger(usage.inputTokens) || !Number.isSafeInteger(usage.outputTokens) ||
      typeof m.providerResponseId !== "string")
    throw new AiCreditResultError("AI_RESULT_PAYLOAD_INVALID");
  // Never retain providerRaw, HTTP headers, secrets, arbitrary transport extras,
  // or user-supplied callbacks. Only the fields needed to restore the result.
  return {text:result.text, usage:{
    provider:usage.provider,inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,
    cachedInputTokens:usage.cachedInputTokens,cacheWriteInputTokens:usage.cacheWriteInputTokens,
    reasoningOutputTokens:usage.reasoningOutputTokens,providerRaw:{},
  }, metadata:{provider:m.provider,model:m.model,temperature:m.temperature,
    schemaName:m.schemaName,serviceTier:m.serviceTier,providerResponseId:m.providerResponseId,
    providerHttpRequestId:m.providerHttpRequestId,reasoningSummary:m.reasoningSummary}};
}
export function sealAiCreditResult(input: Readonly<{
  identity: AiCreditResultIdentity; key: Buffer; result: AiJsonTextResult; keyId?: AiCreditResultKeyId;
}>): AiCreditSealedResult {
  if (input.key.length!==32) throw new AiCreditResultError("AI_RESULT_ENCRYPTION_KEY_INVALID");
  const keyId=input.keyId??"v1";
  const bound=aad(input.identity,keyId);
  if (input.result.metadata.providerResponseId!==input.identity.providerResponseId)
    throw new AiCreditResultError("AI_RESULT_RESPONSE_MISMATCH");
  const plaintext=Buffer.from(JSON.stringify(canonicalResult(input.result)),"utf8");
  if (plaintext.length>AI_RESULT_MAX_BYTES) throw new AiCreditResultError("AI_RESULT_TOO_LARGE");
  const nonce=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",input.key,nonce);
  cipher.setAAD(bound);
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return {keyId,nonce:nonce.toString("base64"),tag:cipher.getAuthTag().toString("base64"),
    ciphertext:ciphertext.toString("base64"),
    contentSha256:createHash("sha256").update(plaintext).digest("hex")};
}
export function openAiCreditResult(input: Readonly<{
  identity: AiCreditResultIdentity; key: Buffer; sealed: AiCreditSealedResult;
}>): AiJsonTextResult {
  if (input.key.length!==32 || !SUPPORTED_KEY_IDS.some(id=>id===input.sealed.keyId))
    throw new AiCreditResultError("AI_RESULT_KEY_VERSION_UNAVAILABLE");
  try {
    const nonce=Buffer.from(input.sealed.nonce,"base64");
    const tag=Buffer.from(input.sealed.tag,"base64");
    const ciphertext=Buffer.from(input.sealed.ciphertext,"base64");
    if(nonce.length!==12 || tag.length!==16 || ciphertext.length>AI_RESULT_MAX_BYTES)
      throw new Error("ciphertext malformed");
    const decipher=createDecipheriv("aes-256-gcm",input.key,nonce);
    decipher.setAAD(aad(input.identity,input.sealed.keyId as AiCreditResultKeyId));decipher.setAuthTag(tag);
    const plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
    if (createHash("sha256").update(plaintext).digest("hex")!==input.sealed.contentSha256)
      throw new Error("digest mismatch");
    const result=JSON.parse(plaintext.toString("utf8")) as AiJsonTextResult;
    if (result?.metadata?.providerResponseId!==input.identity.providerResponseId ||
        typeof result.text!=="string" || !result.usage)
      throw new Error("result mismatch");
    return result;
  } catch {
    // Never leak ciphertext, key material, GCM internals or user content.
    throw new AiCreditResultError("AI_RESULT_AUTHENTICATION_FAILED");
  }
}
