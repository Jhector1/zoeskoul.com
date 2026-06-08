import crypto from "node:crypto";

export type AttachClaims = {
  sid: string;
  actor: string;
  exp: number;
  iat: number;
  jti: string;
};

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function unbase64url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

function signText(secret: string, text: string) {
  return crypto.createHmac("sha256", secret).update(text).digest();
}

function safeEqualText(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function fingerprintSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

export function createAttachTokenWithSecret(args: {
  secret: string;
  sessionId: string;
  actorKey: string;
  ttlSeconds?: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(5, Math.min(args.ttlSeconds ?? 60, 5 * 60));

  const claims: AttachClaims = {
    sid: args.sessionId,
    actor: args.actorKey,
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomUUID(),
  };

  const payload = base64url(JSON.stringify(claims));
  const sig = base64url(signText(args.secret, payload));
  return `${payload}.${sig}`;
}

export function verifyAttachTokenWithSecret(args: {
  secret: string;
  token: string;
}): AttachClaims {
  const [payload, sig] = args.token.split(".");
  if (!payload || !sig) {
    throw new Error("Invalid attach token");
  }

  const expected = base64url(signText(args.secret, payload));
  if (!safeEqualText(sig, expected)) {
    throw new Error("Invalid attach token signature");
  }

  const claims = JSON.parse(
    unbase64url(payload).toString("utf8"),
  ) as AttachClaims;

  if (
    !claims?.sid ||
    !claims?.actor ||
    !claims?.exp ||
    !claims?.iat ||
    !claims?.jti
  ) {
    throw new Error("Invalid attach token payload");
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) {
    throw new Error("Attach token expired");
  }

  // Defense-in-depth: reject tokens that are valid too far into the future.
  if (claims.exp - claims.iat > 5 * 60) {
    throw new Error("Attach token TTL too long");
  }

  return claims;
}

export * from "./auth_helper.js";
