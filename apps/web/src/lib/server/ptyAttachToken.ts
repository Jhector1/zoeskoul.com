import {
  createAttachTokenWithSecret,
  verifyAttachTokenWithSecret,
  type AttachClaims,
} from "@zoeskoul/pty-auth";

function getSecret() {
  const secret = process.env.PTY_ATTACH_SECRET;
  if (!secret) {
    throw new Error("Missing PTY_ATTACH_SECRET");
  }
  return secret;
}

function getAttachTokenTtlSeconds() {
  const raw = process.env.PTY_ATTACH_TOKEN_TTL_SECONDS;
  if (!raw) return 60;

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return 60;

  return Math.max(5, Math.min(value, 300));
}

export function createAttachToken(args: {
  sessionId: string;
  actorKey: string;
  ttlSeconds?: number;
}) {
  return createAttachTokenWithSecret({
    secret: getSecret(),
    sessionId: args.sessionId,
    actorKey: args.actorKey,
    ttlSeconds: args.ttlSeconds ?? getAttachTokenTtlSeconds(),
  });
}

export function verifyAttachToken(token: string): AttachClaims {
  return verifyAttachTokenWithSecret({
    secret: getSecret(),
    token,
  });
}
