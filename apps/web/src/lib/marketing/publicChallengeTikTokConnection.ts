import "server-only";

import { getProductionAppOrigin } from "@zoeskoul/app-config";

import { prisma } from "@/lib/prisma";

type Environment = Record<string, string | undefined>;
type Fetcher = typeof fetch;

const TIKTOK_ACCOUNT_PROVIDER = "zoeskoul-tiktok-publisher";
const TIKTOK_TOKEN_ENDPOINT = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_AUTHORIZE_ENDPOINT = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_REQUIRED_SCOPE = "video.publish";
const TIKTOK_SCOPES = ["user.info.basic", TIKTOK_REQUIRED_SCOPE] as const;
const ACCESS_TOKEN_SKEW_SECONDS = 5 * 60;

type TikTokTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  open_id?: unknown;
  refresh_expires_in?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  token_type?: unknown;
  error?: unknown;
  error_description?: unknown;
};

function value(env: Environment, key: string) {
  return String(env[key] ?? "").trim();
}

function required(env: Environment, key: string) {
  const result = value(env, key);
  if (!result) throw new Error(`${key} is not configured.`);
  return result;
}

function tokenEndpoint(env: Environment) {
  return value(env, "TIKTOK_TOKEN_URL") || TIKTOK_TOKEN_ENDPOINT;
}

export function tiktokRedirectUri(env: Environment = process.env) {
  return (
    value(env, "TIKTOK_REDIRECT_URI") ||
    `${getProductionAppOrigin("website")}/api/integrations/tiktok/callback`
  );
}

export function buildTikTokPublisherAuthorizationUrl(args: {
  state: string;
  env?: Environment;
}) {
  const env = args.env ?? process.env;
  const url = new URL(
    value(env, "TIKTOK_AUTHORIZE_URL") || TIKTOK_AUTHORIZE_ENDPOINT,
  );
  url.search = new URLSearchParams({
    client_key: required(env, "TIKTOK_CLIENT_KEY"),
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
    redirect_uri: tiktokRedirectUri(env),
    state: args.state,
  }).toString();
  return url.toString();
}

function parseTokenPayload(payload: TikTokTokenResponse) {
  const error =
    typeof payload.error_description === "string" && payload.error_description.trim()
      ? payload.error_description.trim()
      : typeof payload.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : null;
  if (error) throw new Error(`TikTok OAuth failed: ${error}`);

  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  const refreshToken =
    typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : "";
  const openId = typeof payload.open_id === "string" ? payload.open_id.trim() : "";
  const scope = typeof payload.scope === "string" ? payload.scope.trim() : "";
  const tokenType =
    typeof payload.token_type === "string" ? payload.token_type.trim() : "Bearer";
  const expiresIn = Number(payload.expires_in);

  if (!accessToken || !refreshToken || !openId || !Number.isFinite(expiresIn)) {
    throw new Error("TikTok OAuth returned incomplete token data.");
  }

  const scopes = new Set(scope.split(",").map((item) => item.trim()).filter(Boolean));
  if (!scopes.has(TIKTOK_REQUIRED_SCOPE)) {
    throw new Error("TikTok authorization did not grant video.publish.");
  }

  return {
    accessToken,
    refreshToken,
    openId,
    scope,
    tokenType,
    expiresAt: Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(expiresIn)),
  };
}

async function tokenRequest(args: {
  body: URLSearchParams;
  env: Environment;
  fetcher: Fetcher;
}) {
  const response = await args.fetcher(tokenEndpoint(args.env), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: args.body,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as TikTokTokenResponse | null;

  if (!response.ok) {
    const detail =
      payload && typeof payload.error_description === "string"
        ? payload.error_description
        : `HTTP ${response.status}`;
    throw new Error(`TikTok OAuth token request failed: ${detail}`);
  }
  if (!payload) throw new Error("TikTok OAuth returned no token payload.");
  return parseTokenPayload(payload);
}

export async function persistTikTokPublisherAuthorization(args: {
  userId: string;
  code: string;
  env?: Environment;
  fetcher?: Fetcher;
}) {
  const env = args.env ?? process.env;
  const fetcher = args.fetcher ?? fetch;
  const tokens = await tokenRequest({
    env,
    fetcher,
    body: new URLSearchParams({
      client_key: required(env, "TIKTOK_CLIENT_KEY"),
      client_secret: required(env, "TIKTOK_CLIENT_SECRET"),
      code: args.code,
      grant_type: "authorization_code",
      redirect_uri: tiktokRedirectUri(env),
    }),
  });

  await prisma.$transaction(async (tx) => {
    await tx.account.deleteMany({
      where: {
        provider: TIKTOK_ACCOUNT_PROVIDER,
        providerAccountId: { not: tokens.openId },
      },
    });

    await tx.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: TIKTOK_ACCOUNT_PROVIDER,
          providerAccountId: tokens.openId,
        },
      },
      update: {
        userId: args.userId,
        type: "oauth",
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: tokens.expiresAt,
        token_type: tokens.tokenType,
        scope: tokens.scope,
      },
      create: {
        userId: args.userId,
        type: "oauth",
        provider: TIKTOK_ACCOUNT_PROVIDER,
        providerAccountId: tokens.openId,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: tokens.expiresAt,
        token_type: tokens.tokenType,
        scope: tokens.scope,
      },
    });
  });

  return { openId: tokens.openId, scope: tokens.scope };
}

export async function getTikTokPublisherAccessToken(args: {
  env?: Environment;
  fetcher?: Fetcher;
} = {}) {
  const env = args.env ?? process.env;
  const fetcher = args.fetcher ?? fetch;

  const staticToken = value(env, "TIKTOK_ACCESS_TOKEN");
  if (staticToken) return staticToken;

  const account = await prisma.account.findFirst({
    where: { provider: TIKTOK_ACCOUNT_PROVIDER },
    select: {
      id: true,
      providerAccountId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
      scope: true,
    },
  });

  if (!account) return null;

  const now = Math.floor(Date.now() / 1000);
  if (
    account.access_token &&
    account.expires_at &&
    account.expires_at > now + ACCESS_TOKEN_SKEW_SECONDS
  ) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error("TikTok publisher authorization has no refresh token. Reconnect TikTok.");
  }

  const tokens = await tokenRequest({
    env,
    fetcher,
    body: new URLSearchParams({
      client_key: required(env, "TIKTOK_CLIENT_KEY"),
      client_secret: required(env, "TIKTOK_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  if (tokens.openId !== account.providerAccountId) {
    throw new Error("TikTok refresh returned a different account identity.");
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      token_type: tokens.tokenType,
      scope: tokens.scope || account.scope,
    },
  });

  return tokens.accessToken;
}
