import "server-only";

import {
  createCipheriv, createDecipheriv, randomBytes,
} from "node:crypto";

/** Phase 4E2B foundation only. No browser route consumes this token yet.
 * It is NOT a Runner capability and cannot authorize writes or WebSockets.
 * The eventual read gateway must recheck current project ownership in the DB
 * AND Runner lease identity on every request (including asset requests).
 */
export const DEVELOPMENT_PREVIEW_READ_TOKEN_TTL_MS = 120_000;
const PREVIEW = /^preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT = /^[A-Za-z0-9_-]{1,128}$/;
const USER = /^[A-Za-z0-9_-]{1,128}$/;
const ENVELOPE = /^dpv1\.[A-Za-z0-9_-]{32,1000}$/;
const AAD = Buffer.from("zoebuild:development-preview:browser-read:v1");

export type DevelopmentPreviewReadClaims = Readonly<{
  userId: string;
  buildProjectId: string;
  previewId: string;
  sourceVersion: number;
  expiresAt: number;
}>;

export class DevelopmentPreviewReadTokenError extends Error {
  constructor() { super("Invalid development preview read token."); }
}

/** Supply a dedicated cryptographically random 32-byte base64url secret.
 * Never reuse Runner or session credentials for this bearer surface.
 */
function requireKey(encoded: string): Buffer {
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) throw new DevelopmentPreviewReadTokenError();
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== encoded)
    throw new DevelopmentPreviewReadTokenError();
  return key;
}
function requireIdentity(value: unknown): asserts value is
  Pick<DevelopmentPreviewReadClaims,"userId" | "buildProjectId" | "previewId" | "sourceVersion"> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DevelopmentPreviewReadTokenError();
  const item = value as Record<string,unknown>;
  if (typeof item.userId !== "string" || !USER.test(item.userId) ||
      typeof item.buildProjectId !== "string" || !PROJECT.test(item.buildProjectId) ||
      typeof item.previewId !== "string" || !PREVIEW.test(item.previewId) ||
      typeof item.sourceVersion !== "number" ||
      !Number.isSafeInteger(item.sourceVersion) || item.sourceVersion < 1)
    throw new DevelopmentPreviewReadTokenError();
}

export function issueDevelopmentPreviewReadToken(
  identity: Pick<DevelopmentPreviewReadClaims,
    "userId" | "buildProjectId" | "previewId" | "sourceVersion">,
  secret: string,
  now = Date.now(),
): string {
  const key = requireKey(secret);
  requireIdentity(identity);
  if (!Number.isSafeInteger(now) || now < 0)
    throw new DevelopmentPreviewReadTokenError();
  const expiresAt = now + DEVELOPMENT_PREVIEW_READ_TOKEN_TTL_MS;
  if (!Number.isSafeInteger(expiresAt)) throw new DevelopmentPreviewReadTokenError();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm",key,nonce);
  cipher.setAAD(AAD);
  const payload = Buffer.from(JSON.stringify({
    userId:identity.userId, buildProjectId:identity.buildProjectId,
    previewId:identity.previewId,sourceVersion:identity.sourceVersion,expiresAt,
  }),"utf8");
  const ciphertext = Buffer.concat([cipher.update(payload),cipher.final()]);
  return "dpv1." + Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString("base64url");
}

export function verifyDevelopmentPreviewReadToken(
  token: string,
  secret: string,
  now = Date.now(),
): DevelopmentPreviewReadClaims {
  const key = requireKey(secret);
  if (typeof token !== "string" || !ENVELOPE.test(token) ||
      !Number.isSafeInteger(now) || now < 0)
    throw new DevelopmentPreviewReadTokenError();
  try {
    const envelope = Buffer.from(token.slice(5),"base64url");
    if (envelope.length < 29 || envelope.toString("base64url") !== token.slice(5))
      throw new DevelopmentPreviewReadTokenError();
    const nonce = envelope.subarray(0,12);
    const tag = envelope.subarray(12,28);
    const ciphertext = envelope.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm",key,nonce);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const decoded: unknown = JSON.parse(Buffer.concat([
      decipher.update(ciphertext),decipher.final(),
    ]).toString("utf8"));
    requireIdentity(decoded);
    const claims = decoded as DevelopmentPreviewReadClaims;
    if (!Number.isSafeInteger(claims.expiresAt) ||
        claims.expiresAt <= now ||
        claims.expiresAt > now + DEVELOPMENT_PREVIEW_READ_TOKEN_TTL_MS)
      throw new DevelopmentPreviewReadTokenError();
    return {
      userId: claims.userId, buildProjectId: claims.buildProjectId,
      previewId: claims.previewId, sourceVersion: claims.sourceVersion,
      expiresAt: claims.expiresAt,
    };
  } catch {
    // No decrypted source, identity, secret or validation stage in errors.
    throw new DevelopmentPreviewReadTokenError();
  }
}
