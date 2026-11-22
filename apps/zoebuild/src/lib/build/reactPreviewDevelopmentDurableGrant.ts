import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@zoeskoul/platform-server/prisma";

/** A ZoeBuild-only, database-backed browser bearer. Only its digest is persisted.
 * The same browser URL can survive renewals, but the lease cannot outlive its
 * absolute lifetime. Renewal requires the authenticated editor session.
 */
export const DURABLE_PREVIEW_GRANT_IDLE_MS = 120_000;
export const DURABLE_PREVIEW_GRANT_ABSOLUTE_MS = 30 * 60_000;
export const DURABLE_PREVIEW_GRANT_PATTERN = /^dpg1\.[A-Za-z0-9_-]{43}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const PREVIEW=/^preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DurablePreviewGrantIdentity = Readonly<{
  userId: string; buildProjectId: string; previewId: string;
  sourceVersion: number;
}>;
export type DurablePreviewGrantRow = Readonly<{
  id: string; userId: string; buildProjectId: string; previewId: string;
  sourceVersionFloor: number; expiresAt: Date; absoluteExpiresAt: Date;
  revokedAt: Date | null;
}>;
export class DurablePreviewGrantError extends Error {
  constructor() { super("Development preview grant unavailable."); }
}
function identityValid(value:DurablePreviewGrantIdentity): boolean {
  return ID.test(value.userId) && ID.test(value.buildProjectId) &&
    PREVIEW.test(value.previewId) && Number.isSafeInteger(value.sourceVersion) && value.sourceVersion>=1;
}
export function digestDurablePreviewGrant(token: string): string {
  if (typeof token!=="string" || !DURABLE_PREVIEW_GRANT_PATTERN.test(token) ||
      Buffer.from(token.slice(5),"base64url").toString("base64url")!==token.slice(5) ||
      Buffer.from(token.slice(5),"base64url").length!==32)
    throw new DurablePreviewGrantError();
  return createHash("sha256").update(token,"utf8").digest("hex");
}
function validRow(row:DurablePreviewGrantRow|undefined, identity:DurablePreviewGrantIdentity): row is DurablePreviewGrantRow {
  return !!row && row.userId===identity.userId && row.buildProjectId===identity.buildProjectId &&
    row.previewId===identity.previewId && Number.isSafeInteger(row.sourceVersionFloor) &&
    row.sourceVersionFloor>=1 && row.sourceVersionFloor<=identity.sourceVersion &&
    row.revokedAt===null && row.expiresAt instanceof Date &&
    row.absoluteExpiresAt instanceof Date;
}
export async function createDurablePreviewGrant(identity:DurablePreviewGrantIdentity):Promise<string> {
  if (!identityValid(identity)) throw new DurablePreviewGrantError();
  const token="dpg1."+randomBytes(32).toString("base64url");
  const digest=digestDurablePreviewGrant(token);
  const now=new Date();
  const expires=new Date(now.getTime()+DURABLE_PREVIEW_GRANT_IDLE_MS);
  const absolute=new Date(now.getTime()+DURABLE_PREVIEW_GRANT_ABSOLUTE_MS);
  // Generated Prisma model is added by the accompanying migration. Do not
  // create the table on request or use in-memory storage.
  await prisma.$executeRaw`
    INSERT INTO "BuildDevelopmentPreviewReadGrant"
     ("id", "userId", "buildProjectId", "previewId", "sourceVersionFloor", "expiresAt", "absoluteExpiresAt", "updatedAt")
    VALUES (${digest}, ${identity.userId}, ${identity.buildProjectId},
            ${identity.previewId}, ${identity.sourceVersion}, ${expires}, ${absolute}, ${now})
  `;
  return token;
}
/** Resolve an opaque token to a current DB row before checking actual
 * project ownership. A digest lookup is not by itself authorization. */
export async function lookupDurablePreviewGrant(token:string):Promise<DurablePreviewGrantRow> {
  const digest=digestDurablePreviewGrant(token);
  const rows=await prisma.$queryRaw<DurablePreviewGrantRow[]>`
    SELECT "id", "userId", "buildProjectId", "previewId", "sourceVersionFloor", "expiresAt", "absoluteExpiresAt", "revokedAt"
      FROM "BuildDevelopmentPreviewReadGrant"
      WHERE "id"=${digest} AND "revokedAt" IS NULL
        AND "expiresAt">NOW() AND "absoluteExpiresAt">NOW()
      LIMIT 1
  `;
  const row=rows[0];
  if (!row || !identityValid({userId:row.userId,buildProjectId:row.buildProjectId,
      previewId:row.previewId,sourceVersion:row.sourceVersionFloor}) ||
      row.revokedAt!==null || !(row.expiresAt instanceof Date) ||
      !(row.absoluteExpiresAt instanceof Date)) throw new DurablePreviewGrantError();
  return row;
}
export async function checkDurablePreviewGrant(token:string,identity:DurablePreviewGrantIdentity):Promise<void> {
  if (!identityValid(identity)) throw new DurablePreviewGrantError();
  const digest=digestDurablePreviewGrant(token);
  const rows=await prisma.$queryRaw<DurablePreviewGrantRow[]>`
    SELECT "id", "userId", "buildProjectId", "previewId", "sourceVersionFloor", "expiresAt", "absoluteExpiresAt", "revokedAt"
      FROM "BuildDevelopmentPreviewReadGrant"
      WHERE "id"=${digest} AND "revokedAt" IS NULL
        AND "expiresAt">NOW() AND "absoluteExpiresAt">NOW()
      LIMIT 1
  `;
  if (!validRow(rows[0],identity)) throw new DurablePreviewGrantError();
}
export async function renewDurablePreviewGrant(token:string,identity:DurablePreviewGrantIdentity):Promise<void> {
  if (!identityValid(identity)) throw new DurablePreviewGrantError();
  const digest=digestDurablePreviewGrant(token);
  const rows=await prisma.$queryRaw<DurablePreviewGrantRow[]>`
    UPDATE "BuildDevelopmentPreviewReadGrant"
       SET "expiresAt"=LEAST("absoluteExpiresAt",NOW()+INTERVAL '120 seconds'), "updatedAt"=NOW()
     WHERE "id"=${digest} AND "userId"=${identity.userId}
       AND "buildProjectId"=${identity.buildProjectId} AND "previewId"=${identity.previewId}
       AND "sourceVersionFloor"<=${identity.sourceVersion}
       AND "revokedAt" IS NULL AND "expiresAt">NOW() AND "absoluteExpiresAt">NOW()
     RETURNING "id", "userId", "buildProjectId", "previewId", "sourceVersionFloor", "expiresAt", "absoluteExpiresAt", "revokedAt"
  `;
  if (!validRow(rows[0],identity)) throw new DurablePreviewGrantError();
}
export async function revokeDurablePreviewGrants(identity:Readonly<{
  userId:string; buildProjectId:string; previewId:string;
}>):Promise<void> {
  if (!ID.test(identity.userId)||!ID.test(identity.buildProjectId)||!PREVIEW.test(identity.previewId))
    throw new DurablePreviewGrantError();
  await prisma.$executeRaw`
    UPDATE "BuildDevelopmentPreviewReadGrant" SET "revokedAt"=NOW(), "updatedAt"=NOW()
    WHERE "userId"=${identity.userId} AND "buildProjectId"=${identity.buildProjectId}
      AND "previewId"=${identity.previewId} AND "revokedAt" IS NULL
  `;
}
