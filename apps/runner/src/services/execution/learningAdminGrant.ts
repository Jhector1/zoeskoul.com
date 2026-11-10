/**
 * Operator-only Stage 2 launch grant. No browser may mint or forward this.
 * A future lesson service must issue grants ONLY after checking enrollment,
 * trusted published lesson metadata, and the requested sandbox profile.
 */
import crypto from "node:crypto";

const allowlistedTopics = new Set([
  "sudo-root-concepts",
  "ownership-administration-concepts",
  "final-capstone-secure-project",
]);
const usedNonces = new Map<string, number>();
const verifiedTokens = new WeakSet<object>();
const MAX_REPLAY_ENTRIES = 4096;

export type VerifiedAdminGrant = Readonly<{
  actorKey: string;
  courseSlug: "linux-files-permissions-users";
  topicSlug: string;
}>;

type GrantClaims = {
  v: 1;
  aud: "zoeskoul-learning-admin";
  actorKey: string;
  courseSlug: "linux-files-permissions-users";
  topicSlug: string;
  iat: number;
  exp: number;
  nonce: string;
};

export class AdminGrantError extends Error {
  constructor(readonly status: 400 | 403 | 503, message: string) {
    super(message);
  }
}

export function adminLabConfiguration() {
  const enabled = process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED === "true";
  const secret = process.env.ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET ?? "";
  const image = process.env.ZOESKOUL_LEARNING_ADMIN_LAB_IMAGE ?? "";
  const pool = process.env.RUNNER_EXECUTION_POOL;
  if (!enabled) throw new AdminGrantError(403, "Administrative learning labs are disabled.");
  if (pool !== "zoeskoul-learning") {
    throw new AdminGrantError(503, "Administrative labs require the dedicated Learning pool.");
  }
  if (Buffer.byteLength(secret, "utf8") < 32 || !/^sha256:[0-9a-f]{64}$/.test(image)) {
    throw new AdminGrantError(503, "Administrative learning lab isolation is not configured.");
  }
  return { secret, image };
}

/** Grant is minted by an operator/trusted entitlement service, never by React. */
export function verifyAdminGrant(token: unknown, actorKey: string, now = Date.now()): VerifiedAdminGrant {
  const { secret } = adminLabConfiguration();
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    throw new AdminGrantError(400, "Invalid administrative lab grant.");
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
    throw new AdminGrantError(400, "Invalid administrative lab grant.");
  }
  const [encoded, signature] = parts;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest();
  const provided = Buffer.from(signature, "base64url");
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new AdminGrantError(403, "Invalid administrative lab authorization.");
  }
  let claims: Partial<GrantClaims>;
  try {
    const raw = Buffer.from(encoded, "base64url");
    if (raw.toString("base64url") !== encoded || raw.length > 2048) throw new Error("bad encoding");
    claims = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new AdminGrantError(400, "Invalid administrative lab grant.");
  }
  const clock = Math.floor(now / 1000);
  if (!claims || typeof claims !== "object" || Array.isArray(claims) ||
      claims.v !== 1 || claims.aud !== "zoeskoul-learning-admin" ||
      claims.actorKey !== actorKey || !actorKey ||
      claims.courseSlug !== "linux-files-permissions-users" ||
      typeof claims.topicSlug !== "string" || !allowlistedTopics.has(claims.topicSlug) ||
      typeof claims.iat !== "number" || !Number.isInteger(claims.iat) ||
      typeof claims.exp !== "number" || !Number.isInteger(claims.exp) ||
      claims.iat > clock + 5 || claims.iat < clock - 60 ||
      claims.exp <= clock || claims.exp > claims.iat + 60 ||
      typeof claims.nonce !== "string" || !/^[a-f0-9]{32}$/.test(claims.nonce)) {
    throw new AdminGrantError(403, "Administrative lab grant is expired or unauthorized.");
  }
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= clock) usedNonces.delete(nonce);
  }
  if (usedNonces.size >= MAX_REPLAY_ENTRIES) {
    throw new AdminGrantError(503, "Administrative lab admission is busy.");
  }
  if (usedNonces.has(claims.nonce)) {
    throw new AdminGrantError(403, "Administrative lab grant was already used.");
  }
  usedNonces.set(claims.nonce, claims.exp);
  const verified = Object.freeze({
    actorKey: claims.actorKey,
    courseSlug: "linux-files-permissions-users" as const,
    topicSlug: claims.topicSlug,
  });
  verifiedTokens.add(verified);
  return verified;
}

export function assertVerifiedAdminGrant(grant: VerifiedAdminGrant, actorKey: string): void {
  if (!grant || !verifiedTokens.has(grant) || grant.actorKey !== actorKey) {
    throw new AdminGrantError(403, "Administrative lab authorization required.");
  }
  adminLabConfiguration();
}
