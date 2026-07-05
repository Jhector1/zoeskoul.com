import "server-only";

import crypto from "node:crypto";

export type SharedChallengeClaims = {
  v: 1;
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
  exerciseKey: string;
  exercisePurpose?: "quiz" | "project";
  iat: number;
  exp?: number;
};

const MAX_TOKEN_LENGTH = 8_192;

function getSecret() {
  const secret =
    process.env.CHALLENGE_LINK_SECRET ||
    process.env.PRACTICE_KEY_SECRET ||
    process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error(
      "Missing CHALLENGE_LINK_SECRET (or PRACTICE_KEY_SECRET/AUTH_SECRET fallback).",
    );
  }

  return secret;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signBody(body: string) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`shared-practice-challenge:v1:${body}`, "utf8")
    .digest("base64url");
}

function safeEqualBase64Url(a: string, b: string) {
  let left: Buffer;
  let right: Buffer;

  try {
    left = Buffer.from(a, "base64url");
    right = Buffer.from(b, "base64url");
  } catch {
    return false;
  }

  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function signSharedChallenge(
  target: Omit<SharedChallengeClaims, "v" | "iat" | "exp">,
  options?: { expiresAt?: Date | null },
) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = options?.expiresAt
    ? Math.floor(options.expiresAt.getTime() / 1000)
    : undefined;

  const claims: SharedChallengeClaims = {
    v: 1,
    subjectSlug: target.subjectSlug,
    moduleSlug: target.moduleSlug,
    sectionSlug: target.sectionSlug,
    topicSlug: target.topicSlug,
    exerciseKey: target.exerciseKey,
    ...(target.exercisePurpose ? { exercisePurpose: target.exercisePurpose } : {}),
    iat: now,
    ...(expiresAt ? { exp: expiresAt } : {}),
  };

  const body = encodeJson(claims);
  return `${body}.${signBody(body)}`;
}

export function verifySharedChallenge(
  token: unknown,
): SharedChallengeClaims | null {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let expected: string;
  try {
    expected = signBody(body);
  } catch {
    return null;
  }

  if (!safeEqualBase64Url(signature, expected)) return null;

  let claims: SharedChallengeClaims;
  try {
    claims = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SharedChallengeClaims;
  } catch {
    return null;
  }

  if (
    claims?.v !== 1 ||
    !isNonEmptyString(claims.subjectSlug) ||
    !isNonEmptyString(claims.moduleSlug) ||
    !isNonEmptyString(claims.sectionSlug) ||
    !isNonEmptyString(claims.topicSlug) ||
    !isNonEmptyString(claims.exerciseKey) ||
    (claims.exercisePurpose !== undefined &&
      claims.exercisePurpose !== "quiz" &&
      claims.exercisePurpose !== "project") ||
    typeof claims.iat !== "number"
  ) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp <= now) return null;

  return claims;
}

export function sharedChallengeFingerprint(token: string) {
  return crypto
    .createHash("sha256")
    .update(`shared-practice-challenge:${token}`, "utf8")
    .digest("hex");
}
