// src/lib/practice/key.ts
import crypto from "crypto";

export type PracticeKeyPayload = {
  instanceId: string;
  sessionId?: string | null;
  userId?: string | null;
  guestId?: string | null;
  exp: number; // unix seconds
  allowReveal?: boolean;
};

function getSecret(): string {
  const s = process.env.PRACTICE_KEY_SECRET || process.env.AUTH_SECRET;
  if (!s) {
    // IMPORTANT: don't silently fall back, it causes "GET works, validate fails" in dev
    // when different route bundles capture different defaults.
    throw new Error("Missing PRACTICE_KEY_SECRET (or AUTH_SECRET fallback).");
  }
  return s;
}

function b64urlJson(obj: any) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function unb64urlJson<T>(input: string): T {
  return JSON.parse(Buffer.from(input, "base64url").toString("utf8")) as T;
}

export function signPracticeKey(payload: PracticeKeyPayload) {
  const SECRET = getSecret();

  // body is base64url(JSON)
  const body = b64urlJson(payload);

  // sig is base64url(raw 32-byte hmac)
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");

  return `${body}.${sig}`;
}

/**
 * Returns payload or null. Never throws on bad input.
 */
export function verifyPracticeKey(key: unknown): PracticeKeyPayload | null {
  if (typeof key !== "string") return null;


  const dot = key.indexOf(".");
  if (dot <= 0) return null;

  const body = key.slice(0, dot);
  const sigB64 = key.slice(dot + 1);
  if (!body || !sigB64) return null;



  let sigBuf: Buffer;
  try {
    // decode base64url -> raw bytes (32 bytes for sha256)
    sigBuf = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  if (sigBuf.length !== 32) return null;

  let expectedBuf: Buffer;
  try {
    const SECRET = getSecret();
    expectedBuf = crypto.createHmac("sha256", SECRET).update(body).digest(); // raw bytes
  } catch {
    // secret missing -> treat as invalid key
    return null;
  }

  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  let payload: PracticeKeyPayload;
  try {
    payload = unb64urlJson<PracticeKeyPayload>(body);
  } catch {
    return null;
  }

  if (typeof payload.instanceId !== "string" || !payload.instanceId) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;

  return payload;
}
