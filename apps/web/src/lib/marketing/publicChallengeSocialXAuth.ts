import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { prisma } from "@/lib/prisma";

const X_PROVIDER = "x";
const TOKEN_ENDPOINT = "https://api.x.com/2/oauth2/token";
const AUTHORIZATION_ENDPOINT = "https://x.com/i/oauth2/authorize";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export const PUBLIC_CHALLENGE_X_OAUTH_COOKIE =
  "zoeskoul_public_challenge_x_oauth";

export const PUBLIC_CHALLENGE_X_OAUTH_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "media.write",
  "offline.access",
] as const;

type Environment = NodeJS.ProcessEnv;
type Fetcher = typeof fetch;

type CredentialRow = {
  provider: string;
  accessTokenCiphertext: string | null;
  refreshTokenCiphertext: string | null;
  accessTokenExpiresAt: Date | null;
  scope: string | null;
  connectedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type CredentialStore = {
  findUnique(args: {
    where: { provider: string };
  }): Promise<CredentialRow | null>;
  upsert(args: {
    where: { provider: string };
    create: {
      provider: string;
      accessTokenCiphertext: string;
      refreshTokenCiphertext: string;
      accessTokenExpiresAt: Date;
      scope: string;
      connectedAt: Date;
    };
    update: {
      accessTokenCiphertext: string;
      refreshTokenCiphertext: string;
      accessTokenExpiresAt: Date;
      scope: string;
      connectedAt: Date;
    };
  }): Promise<CredentialRow>;
  update(args: {
    where: { provider: string };
    data: {
      accessTokenCiphertext: string;
      refreshTokenCiphertext: string;
      accessTokenExpiresAt: Date;
      scope: string;
    };
  }): Promise<CredentialRow>;
};

type AuthOptions = {
  env?: Environment;
  fetcher?: Fetcher;
  now?: Date;
  store?: CredentialStore;
};

type OAuthStatePayload = {
  state: string;
  verifier: string;
  expiresAt: number;
};

type XTokenPayload = {
  token_type?: unknown;
  expires_in?: unknown;
  access_token?: unknown;
  scope?: unknown;
  refresh_token?: unknown;
};

function value(env: Environment, key: string) {
  return String(env[key] ?? "").trim();
}

function defaultStore(): CredentialStore {
  return prisma.publicChallengeSocialCredential as unknown as CredentialStore;
}

function credentialKey(env: Environment) {
  const encoded = value(env, "ZOESKOUL_SOCIAL_CREDENTIAL_KEY");
  if (!encoded) {
    throw new Error(
      "ZOESKOUL_SOCIAL_CREDENTIAL_KEY is not configured.",
    );
  }

  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(encoded)) {
    key = Buffer.from(encoded, "hex");
  } else {
    key = Buffer.from(encoded, "base64");
  }

  if (key.byteLength !== 32) {
    throw new Error(
      "ZOESKOUL_SOCIAL_CREDENTIAL_KEY must decode to exactly 32 bytes.",
    );
  }

  return key;
}

function encryptSecret(
  plaintext: string,
  env: Environment,
  aad: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    credentialKey(env),
    iv,
  );
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptSecret(
  ciphertext: string,
  env: Environment,
  aad: string,
) {
  const [version, ivPart, tagPart, encryptedPart] =
    ciphertext.split(".");
  if (
    version !== "v1" ||
    !ivPart ||
    !tagPart ||
    !encryptedPart
  ) {
    throw new Error("Stored X credential has an invalid format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    credentialKey(env),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function accessTokenAad() {
  return "public-challenge-social:x:access-token";
}

function refreshTokenAad() {
  return "public-challenge-social:x:refresh-token";
}

function oauthStateAad() {
  return "public-challenge-social:x:oauth-state";
}

function oauthRuntimeConfig(env: Environment) {
  const clientId = value(env, "X_OAUTH_CLIENT_ID");
  const clientSecret = value(env, "X_OAUTH_CLIENT_SECRET");
  const redirectUri = value(env, "X_OAUTH_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "X OAuth requires X_OAUTH_CLIENT_ID, X_OAUTH_CLIENT_SECRET, and X_OAUTH_REDIRECT_URI.",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function publicChallengeXOAuthRuntimeConfigured(
  env: Environment = process.env,
) {
  try {
    oauthRuntimeConfig(env);
    credentialKey(env);
    return true;
  } catch {
    return false;
  }
}

function parseScope(scope: string) {
  return new Set(scope.split(/\s+/).filter(Boolean));
}

function requirePublishingScopes(scope: string) {
  const granted = parseScope(scope);
  const missing = PUBLIC_CHALLENGE_X_OAUTH_SCOPES.filter(
    (required) => !granted.has(required),
  );
  if (missing.length) {
    throw new Error(
      `X authorization is missing required scope${
        missing.length === 1 ? "" : "s"
      }: ${missing.join(", ")}. Reconnect X and approve the requested permissions.`,
    );
  }
}

async function tokenErrorDetail(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body) {
    return `${response.status} ${response.statusText}`.trim();
  }

  try {
    const parsed = JSON.parse(body) as {
      error?: unknown;
      error_description?: unknown;
      title?: unknown;
      detail?: unknown;
    };
    const parts = [
      typeof parsed.error === "string" ? parsed.error : "",
      typeof parsed.error_description === "string"
        ? parsed.error_description
        : "",
      typeof parsed.title === "string" ? parsed.title : "",
      typeof parsed.detail === "string" ? parsed.detail : "",
    ].filter(Boolean);
    return parts.length ? parts.join(": ") : body.slice(0, 800);
  } catch {
    return body.slice(0, 800);
  }
}

function parseTokenPayload(payload: XTokenPayload) {
  const accessToken =
    typeof payload.access_token === "string"
      ? payload.access_token.trim()
      : "";
  const refreshToken =
    typeof payload.refresh_token === "string"
      ? payload.refresh_token.trim()
      : "";
  const scope =
    typeof payload.scope === "string" ? payload.scope.trim() : "";
  const expiresIn =
    typeof payload.expires_in === "number"
      ? payload.expires_in
      : Number(payload.expires_in);

  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("X OAuth returned an incomplete token response.");
  }
  if (!scope) {
    throw new Error("X OAuth returned no granted scope list.");
  }

  requirePublishingScopes(scope);
  return { accessToken, refreshToken, scope, expiresIn };
}

function basicAuth(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString(
    "base64",
  )}`;
}

async function requestToken(args: {
  body: URLSearchParams;
  env: Environment;
  fetcher: Fetcher;
}) {
  const { clientId, clientSecret } = oauthRuntimeConfig(args.env);
  const response = await args.fetcher(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: basicAuth(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: args.body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `X OAuth token request failed (${response.status}): ${await tokenErrorDetail(
        response,
      )}`,
    );
  }

  return parseTokenPayload((await response.json()) as XTokenPayload);
}

function encodeStateCookie(payload: OAuthStatePayload, env: Environment) {
  return encryptSecret(JSON.stringify(payload), env, oauthStateAad());
}

function decodeStateCookie(valueToDecode: string, env: Environment) {
  let payload: unknown;
  try {
    payload = JSON.parse(
      decryptSecret(valueToDecode, env, oauthStateAad()),
    );
  } catch {
    throw new Error("X OAuth state cookie is invalid or expired.");
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as OAuthStatePayload).state !== "string" ||
    typeof (payload as OAuthStatePayload).verifier !== "string" ||
    typeof (payload as OAuthStatePayload).expiresAt !== "number"
  ) {
    throw new Error("X OAuth state cookie is invalid or expired.");
  }

  return payload as OAuthStatePayload;
}

export function createPublicChallengeXAuthorizationRequest(
  env: Environment = process.env,
  now = new Date(),
) {
  const { clientId, redirectUri } = oauthRuntimeConfig(env);
  credentialKey(env);

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier, "utf8")
    .digest("base64url");

  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set(
    "scope",
    PUBLIC_CHALLENGE_X_OAUTH_SCOPES.join(" "),
  );
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return {
    authorizationUrl: url.toString(),
    cookieValue: encodeStateCookie(
      {
        state,
        verifier,
        expiresAt:
          now.getTime() + OAUTH_STATE_TTL_SECONDS * 1000,
      },
      env,
    ),
    cookieMaxAge: OAUTH_STATE_TTL_SECONDS,
  };
}

export async function completePublicChallengeXAuthorization(args: {
  code: string;
  state: string;
  cookieValue: string;
} & AuthOptions) {
  const env = args.env ?? process.env;
  const fetcher = args.fetcher ?? fetch;
  const now = args.now ?? new Date();
  const store = args.store ?? defaultStore();
  const { clientId, redirectUri } = oauthRuntimeConfig(env);
  const statePayload = decodeStateCookie(args.cookieValue, env);

  if (statePayload.expiresAt < now.getTime()) {
    throw new Error("X OAuth authorization expired. Start the connection again.");
  }
  if (statePayload.state !== args.state) {
    throw new Error("X OAuth state did not match the connection request.");
  }

  const token = await requestToken({
    env,
    fetcher,
    body: new URLSearchParams({
      code: args.code,
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: statePayload.verifier,
    }),
  });

  if (!token.refreshToken) {
    throw new Error(
      "X OAuth returned no refresh token. Reconnect X with offline.access enabled.",
    );
  }

  const expiresAt = new Date(
    now.getTime() + token.expiresIn * 1000,
  );
  await store.upsert({
    where: { provider: X_PROVIDER },
    create: {
      provider: X_PROVIDER,
      accessTokenCiphertext: encryptSecret(
        token.accessToken,
        env,
        accessTokenAad(),
      ),
      refreshTokenCiphertext: encryptSecret(
        token.refreshToken,
        env,
        refreshTokenAad(),
      ),
      accessTokenExpiresAt: expiresAt,
      scope: token.scope,
      connectedAt: now,
    },
    update: {
      accessTokenCiphertext: encryptSecret(
        token.accessToken,
        env,
        accessTokenAad(),
      ),
      refreshTokenCiphertext: encryptSecret(
        token.refreshToken,
        env,
        refreshTokenAad(),
      ),
      accessTokenExpiresAt: expiresAt,
      scope: token.scope,
      connectedAt: now,
    },
  });

  return {
    connected: true as const,
    scope: token.scope,
    expiresAt,
  };
}

export async function isPublicChallengeXCredentialConfigured(
  options: Pick<AuthOptions, "env" | "store"> = {},
) {
  const env = options.env ?? process.env;
  if (value(env, "X_USER_ACCESS_TOKEN")) return true;

  try {
    credentialKey(env);
  } catch {
    return false;
  }

  const store = options.store ?? defaultStore();
  try {
    const row = await store.findUnique({
      where: { provider: X_PROVIDER },
    });
    return Boolean(
      row?.accessTokenCiphertext || row?.refreshTokenCiphertext,
    );
  } catch {
    return Boolean(value(env, "X_USER_ACCESS_TOKEN"));
  }
}

export async function getPublicChallengeXAccessToken(
  options: AuthOptions = {},
) {
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? new Date();
  const store = options.store ?? defaultStore();

  let row: CredentialRow | null;
  try {
    row = await store.findUnique({
      where: { provider: X_PROVIDER },
    });
  } catch (error) {
    const legacyToken = value(env, "X_USER_ACCESS_TOKEN");
    if (legacyToken) return legacyToken;
    throw error;
  }

  if (!row) {
    const legacyToken = value(env, "X_USER_ACCESS_TOKEN");
    if (legacyToken) return legacyToken;
    throw new Error(
      "X is not connected. Authorize X before publishing.",
    );
  }

  if (
    row.accessTokenCiphertext &&
    (!row.accessTokenExpiresAt ||
      row.accessTokenExpiresAt.getTime() >
        now.getTime() + REFRESH_BUFFER_MS)
  ) {
    return decryptSecret(
      row.accessTokenCiphertext,
      env,
      accessTokenAad(),
    );
  }

  if (!row.refreshTokenCiphertext) {
    throw new Error(
      "X access token expired and no refresh token is stored. Reconnect X.",
    );
  }

  const { clientId } = oauthRuntimeConfig(env);
  const currentRefreshToken = decryptSecret(
    row.refreshTokenCiphertext,
    env,
    refreshTokenAad(),
  );

  const refreshed = await requestToken({
    env,
    fetcher,
    body: new URLSearchParams({
      refresh_token: currentRefreshToken,
      grant_type: "refresh_token",
      client_id: clientId,
    }),
  });

  const nextRefreshToken =
    refreshed.refreshToken || currentRefreshToken;
  const expiresAt = new Date(
    now.getTime() + refreshed.expiresIn * 1000,
  );

  await store.update({
    where: { provider: X_PROVIDER },
    data: {
      accessTokenCiphertext: encryptSecret(
        refreshed.accessToken,
        env,
        accessTokenAad(),
      ),
      refreshTokenCiphertext: encryptSecret(
        nextRefreshToken,
        env,
        refreshTokenAad(),
      ),
      accessTokenExpiresAt: expiresAt,
      scope: refreshed.scope,
    },
  });

  return refreshed.accessToken;
}
