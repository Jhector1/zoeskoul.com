import {
  verifyAttachTokenWithSecret,
  type AttachClaims,
} from "@zoeskoul/pty-auth";
import { env } from "./env.js";

const usedAttachJtis = new Map<string, number>();

function getSecret() {
  const secret = process.env.PTY_ATTACH_SECRET;
  if (!secret) {
    throw new Error("Missing PTY_ATTACH_SECRET");
  }
  return secret;
}

function pruneReplayCache() {
  const now = Date.now();
  for (const [jti, expiresAt] of usedAttachJtis) {
    if (expiresAt <= now) usedAttachJtis.delete(jti);
  }
}

export function verifyAttachToken(token: string): AttachClaims {
  pruneReplayCache();

  const claims = verifyAttachTokenWithSecret({
    secret: getSecret(),
    token,
  });

  if (usedAttachJtis.has(claims.jti)) {
    throw new Error("Attach token already used");
  }

  usedAttachJtis.set(claims.jti, Date.now() + env.attachReplayTtlMs);
  return claims;
}
