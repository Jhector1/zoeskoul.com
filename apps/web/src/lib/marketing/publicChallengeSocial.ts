import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import {
  PUBLIC_CHALLENGE_SOCIAL_PROVIDER_LABELS,
  PUBLIC_CHALLENGE_SOCIAL_PROVIDERS,
  type PublicChallengeSocialProvider,
  type PublicChallengeSocialProviderStatus,
} from "@zoeskoul/api-contracts";

import { getTikTokPublisherAccessToken } from "@/lib/marketing/publicChallengeTikTokConnection";

export type PublicChallengeSocialContent = {
  title: string;
  description: string;
  subjectSlug: string;
  challengeUrl: string;
  imageUrl: string | null;
  imageAlt: string;
};

export type PublicChallengeSocialProviderResult = {
  providerPostId: string;
  providerPostUrl: string | null;
};

type Environment = NodeJS.ProcessEnv;
type Fetcher = typeof fetch;

export class PublicChallengeSocialProviderError extends Error {
  constructor(
    public readonly provider: PublicChallengeSocialProvider,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PublicChallengeSocialProviderError";
  }
}

function value(env: Environment, key: string) {
  return String(env[key] ?? "").trim();
}

function configured(...parts: string[]) {
  return parts.every(Boolean);
}

function enabledFlag(env: Environment, key: string) {
  return ["1", "true", "yes", "on"].includes(
    value(env, key).toLowerCase(),
  );
}

function providerConfigured(
  provider: PublicChallengeSocialProvider,
  env: Environment,
) {
  switch (provider) {
    case "facebook":
      return configured(
        value(env, "META_GRAPH_API_VERSION"),
        value(env, "FACEBOOK_PAGE_ID"),
        value(env, "FACEBOOK_PAGE_ACCESS_TOKEN"),
      );
    case "instagram":
      return configured(
        value(env, "META_GRAPH_API_VERSION"),
        value(env, "INSTAGRAM_BUSINESS_ACCOUNT_ID"),
        value(env, "INSTAGRAM_ACCESS_TOKEN"),
      );
    case "linkedin":
      return configured(
        value(env, "LINKEDIN_VERSION"),
        value(env, "LINKEDIN_ACCESS_TOKEN"),
        value(env, "LINKEDIN_AUTHOR_URN"),
      );
    case "x":
      return configured(
        value(env, "X_API_KEY"),
        value(env, "X_API_SECRET"),
        value(env, "X_ACCESS_TOKEN"),
        value(env, "X_ACCESS_TOKEN_SECRET"),
      );
    case "threads":
      return configured(value(env, "THREADS_ACCESS_TOKEN"));
    case "reddit":
      return (
        enabledFlag(env, "REDDIT_COMMERCIAL_API_APPROVED") &&
        configured(
          value(env, "REDDIT_USER_AGENT"),
          value(env, "REDDIT_SUBREDDIT"),
        ) &&
        Boolean(
          value(env, "REDDIT_ACCESS_TOKEN") ||
            configured(
              value(env, "REDDIT_CLIENT_ID"),
              value(env, "REDDIT_CLIENT_SECRET"),
              value(env, "REDDIT_REFRESH_TOKEN"),
            ),
        )
      );
    case "tiktok": {
      const privacyLevel = value(env, "TIKTOK_PRIVACY_LEVEL");
      const credentialsReady =
        configured(value(env, "TIKTOK_ACCESS_TOKEN")) ||
        configured(
          value(env, "TIKTOK_CLIENT_KEY"),
          value(env, "TIKTOK_CLIENT_SECRET"),
        );
      return (
        configured(privacyLevel) &&
        credentialsReady &&
        (privacyLevel === "SELF_ONLY" ||
          enabledFlag(env, "TIKTOK_DIRECT_POST_AUDITED"))
      );
    }
  }
}

const IMAGE_REQUIRED_PROVIDERS = new Set<PublicChallengeSocialProvider>([
  "instagram",
  "x",
  "tiktok",
]);

export function publicChallengeSocialProviderStatuses(
  env: Environment = process.env,
): PublicChallengeSocialProviderStatus[] {
  return PUBLIC_CHALLENGE_SOCIAL_PROVIDERS.map((provider) => ({
    provider,
    label: PUBLIC_CHALLENGE_SOCIAL_PROVIDER_LABELS[provider],
    configured: providerConfigured(provider, env),
    imageRequired: IMAGE_REQUIRED_PROVIDERS.has(provider),
  }));
}

export function publicChallengeSocialSchedulerConfigured(
  env: Environment = process.env,
) {
  return Boolean(value(env, "ZOESKOUL_SOCIAL_SCHEDULER_SECRET"));
}

function graphBase(env: Environment) {
  const version = value(env, "META_GRAPH_API_VERSION");
  if (!version) {
    throw new Error("META_GRAPH_API_VERSION is not configured.");
  }
  return `https://graph.facebook.com/${version}`;
}

async function responseDetail(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body) return `${response.status} ${response.statusText}`.trim();
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string };
      title?: string;
      detail?: string;
      errors?: Array<{ message?: string; detail?: string }>;
    };
    return (
      parsed.error?.message ||
      parsed.detail ||
      parsed.title ||
      parsed.errors?.[0]?.detail ||
      parsed.errors?.[0]?.message ||
      body.slice(0, 600)
    );
  } catch {
    return body.slice(0, 600);
  }
}

async function requireOk(
  provider: PublicChallengeSocialProvider,
  response: Response,
) {
  if (response.ok) return response;
  throw new PublicChallengeSocialProviderError(
    provider,
    await responseDetail(response),
    response.status,
  );
}

type XOAuth1Credentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

function xOAuth1Credentials(env: Environment): XOAuth1Credentials {
  const credentials = {
    apiKey: value(env, "X_API_KEY"),
    apiSecret: value(env, "X_API_SECRET"),
    accessToken: value(env, "X_ACCESS_TOKEN"),
    accessTokenSecret: value(env, "X_ACCESS_TOKEN_SECRET"),
  };

  if (!configured(...Object.values(credentials))) {
    throw new PublicChallengeSocialProviderError(
      "x",
      "X OAuth 1.0a credentials are not configured.",
    );
  }

  return credentials;
}

function oauthPercentEncode(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function xOAuth1Authorization(args: {
  method: string;
  url: string;
  credentials: XOAuth1Credentials;
  nonce?: string;
  timestamp?: string;
}) {
  const parsedUrl = new URL(args.url);
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: args.credentials.apiKey,
    oauth_nonce: args.nonce ?? randomBytes(18).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:
      args.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: args.credentials.accessToken,
    oauth_version: "1.0",
  };

  const signatureParams: Array<[string, string]> = [
    ...Object.entries(oauthParams),
    ...Array.from(parsedUrl.searchParams.entries()),
  ];

  const normalizedParams = signatureParams
    .map(([key, itemValue]) => [
      oauthPercentEncode(key),
      oauthPercentEncode(itemValue),
    ] as const)
    .sort(([aKey, aValue], [bKey, bValue]) => {
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
      return 0;
    })
    .map(([key, itemValue]) => `${key}=${itemValue}`)
    .join("&");

  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
  const signatureBase = [
    args.method.toUpperCase(),
    oauthPercentEncode(baseUrl),
    oauthPercentEncode(normalizedParams),
  ].join("&");
  const signingKey = `${oauthPercentEncode(
    args.credentials.apiSecret,
  )}&${oauthPercentEncode(args.credentials.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64");

  return `OAuth ${Object.entries({
    ...oauthParams,
    oauth_signature: signature,
  })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(
      ([key, itemValue]) =>
        `${oauthPercentEncode(key)}="${oauthPercentEncode(itemValue)}"`,
    )
    .join(", ")}`;
}

function xOAuth1Headers(args: {
  method: string;
  url: string;
  credentials: XOAuth1Credentials;
  contentType?: string;
}) {
  return {
    Authorization: xOAuth1Authorization(args),
    ...(args.contentType ? { "Content-Type": args.contentType } : {}),
  };
}

export function publicChallengeSocialHashtags(
  subjectSlug: string,
) {
  const slug = String(subjectSlug ?? "")
    .trim()
    .toLowerCase();

  let subjectTag: string | null = null;

  if (
    slug.includes("python") ||
    slug === "data-functions" ||
    slug === "applied-projects"
  ) {
    subjectTag = "#Python";
  } else if (
    slug.includes("sql") ||
    slug === "analysis-reporting" ||
    slug === "multi-table" ||
    slug === "data-management"
  ) {
    subjectTag = "#SQL";
  } else if (slug.includes("linux")) {
    subjectTag = "#Linux";
  } else if (slug.includes("git")) {
    subjectTag = "#Git";
  }

  return [
    subjectTag,
    "#CodingChallenge",
    "#Programming",
    "#ZoeSkoul",
  ].filter(
    (tag): tag is string =>
      Boolean(tag),
  );
}

function hashtagText(
  content: PublicChallengeSocialContent,
) {
  return publicChallengeSocialHashtags(
    content.subjectSlug,
  ).join(" ");
}

function caption(
  content: PublicChallengeSocialContent,
) {
  return [
    content.title.trim(),
    content.description.trim(),
    content.challengeUrl.trim(),
    hashtagText(content),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function xText(
  content: PublicChallengeSocialContent,
) {
  const suffix = [
    content.challengeUrl.trim(),
    hashtagText(content),
  ]
    .filter(Boolean)
    .join("\n");

  const body = [
    content.title.trim(),
    content.description.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  const separator =
    body && suffix ? "\n\n" : "";

  const room = Math.max(
    0,
    280 -
      separator.length -
      suffix.length,
  );

  const prefix =
    body.length <= room
      ? body
      : room > 1
        ? `${body
            .slice(0, room - 1)
            .trimEnd()}…`
        : "";

  return [
    prefix,
    suffix,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 280);
}

async function publishFacebook(
  content: PublicChallengeSocialContent,
  env: Environment,
  fetcher: Fetcher,
): Promise<PublicChallengeSocialProviderResult> {
  const pageId = value(env, "FACEBOOK_PAGE_ID");
  const token = value(env, "FACEBOOK_PAGE_ACCESS_TOKEN");
  if (!configured(pageId, token)) {
    throw new PublicChallengeSocialProviderError(
      "facebook",
      "Facebook Page credentials are not configured.",
    );
  }

  const response = await requireOk(
    "facebook",
    await fetcher(`${graphBase(env)}/${encodeURIComponent(pageId)}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        message: caption(content),
        link: content.challengeUrl,
        access_token: token,
      }),
      cache: "no-store",
    }),
  );
  const payload = (await response.json()) as { id?: unknown };
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) {
    throw new PublicChallengeSocialProviderError(
      "facebook",
      "Facebook returned no post ID.",
    );
  }
  return { providerPostId: id, providerPostUrl: null };
}

async function publishInstagram(
  content: PublicChallengeSocialContent,
  env: Environment,
  fetcher: Fetcher,
): Promise<PublicChallengeSocialProviderResult> {
  const accountId = value(env, "INSTAGRAM_BUSINESS_ACCOUNT_ID");
  const token = value(env, "INSTAGRAM_ACCESS_TOKEN");
  if (!configured(accountId, token)) {
    throw new PublicChallengeSocialProviderError(
      "instagram",
      "Instagram publishing credentials are not configured.",
    );
  }
  if (!content.imageUrl) {
    throw new PublicChallengeSocialProviderError(
      "instagram",
      "Instagram requires a public challenge image.",
    );
  }

  const createResponse = await requireOk(
    "instagram",
    await fetcher(`${graphBase(env)}/${encodeURIComponent(accountId)}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: content.imageUrl,
        caption: caption(content).slice(0, 2200),
        access_token: token,
      }),
      cache: "no-store",
    }),
  );
  const created = (await createResponse.json()) as { id?: unknown };
  const creationId = typeof created.id === "string" ? created.id : "";
  if (!creationId) {
    throw new PublicChallengeSocialProviderError(
      "instagram",
      "Instagram returned no media container ID.",
    );
  }

  const publishResponse = await requireOk(
    "instagram",
    await fetcher(
      `${graphBase(env)}/${encodeURIComponent(accountId)}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: creationId,
          access_token: token,
        }),
        cache: "no-store",
      },
    ),
  );
  const published = (await publishResponse.json()) as { id?: unknown };
  const id = typeof published.id === "string" ? published.id : "";
  if (!id) {
    throw new PublicChallengeSocialProviderError(
      "instagram",
      "Instagram returned no published media ID.",
    );
  }
  return { providerPostId: id, providerPostUrl: null };
}

function threadsApiBase(env: Environment) {
  return (value(env, "THREADS_API_BASE") || "https://graph.threads.net/v1.0").replace(/\/$/, "");
}

async function publishThreads(
  content: PublicChallengeSocialContent,
  env: Environment,
  fetcher: Fetcher,
): Promise<PublicChallengeSocialProviderResult> {
  const token = value(env, "THREADS_ACCESS_TOKEN");
  if (!token) {
    throw new PublicChallengeSocialProviderError(
      "threads",
      "Threads publishing credentials are not configured.",
    );
  }

  const createParams = new URLSearchParams({
    media_type: content.imageUrl ? "IMAGE" : "TEXT",
    text: caption(content).slice(0, 500),
    access_token: token,
  });
  if (content.imageUrl) {
    createParams.set("image_url", content.imageUrl);
    createParams.set("alt_text", content.imageAlt.slice(0, 1000));
  }

  const createResponse = await requireOk(
    "threads",
    await fetcher(`${threadsApiBase(env)}/me/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createParams,
      cache: "no-store",
    }),
  );
  const created = (await createResponse.json()) as { id?: unknown };
  const creationId = typeof created.id === "string" ? created.id : "";
  if (!creationId) {
    throw new PublicChallengeSocialProviderError(
      "threads",
      "Threads returned no media container ID.",
    );
  }

  const publishResponse = await requireOk(
    "threads",
    await fetcher(`${threadsApiBase(env)}/me/threads_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: token,
      }),
      cache: "no-store",
    }),
  );
  const published = (await publishResponse.json()) as { id?: unknown };
  const id = typeof published.id === "string" ? published.id : "";
  if (!id) {
    throw new PublicChallengeSocialProviderError(
      "threads",
      "Threads returned no published post ID.",
    );
  }

  return { providerPostId: id, providerPostUrl: null };
}

async function publishLinkedIn(
  content: PublicChallengeSocialContent,
  env: Environment,
  fetcher: Fetcher,
): Promise<PublicChallengeSocialProviderResult> {
  const token = value(env, "LINKEDIN_ACCESS_TOKEN");
  const author = value(env, "LINKEDIN_AUTHOR_URN");
  const linkedinVersion = value(env, "LINKEDIN_VERSION");

  if (!configured(token, author, linkedinVersion)) {
    throw new PublicChallengeSocialProviderError(
      "linkedin",
      "LinkedIn publishing credentials are not configured.",
    );
  }

  const response = await requireOk(
    "linkedin",
    await fetcher("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Linkedin-Version": linkedinVersion,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author,
        commentary: caption(content),
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
      cache: "no-store",
    }),
  );

  const id = response.headers.get("x-restli-id")?.trim() || "";
  if (!id) {
    throw new PublicChallengeSocialProviderError(
      "linkedin",
      "LinkedIn returned no post ID.",
    );
  }
  return { providerPostId: id, providerPostUrl: null };
}

const X_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function normalizedContentType(response: Response) {
  return (response.headers.get("content-type") || "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
}

function xImageFilename(mediaType: string) {
  switch (mediaType) {
    case "image/png":
      return "challenge.png";
    case "image/gif":
      return "challenge.gif";
    case "image/webp":
      return "challenge.webp";
    default:
      return "challenge.jpg";
  }
}

async function uploadXImage(args: {
  imageUrl: string;
  credentials: XOAuth1Credentials;
  base: string;
  fetcher: Fetcher;
}) {
  const imageResponse = await args.fetcher(args.imageUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!imageResponse.ok) {
    throw new PublicChallengeSocialProviderError(
      "x",
      `Could not download the challenge image for X: ${await responseDetail(
        imageResponse,
      )}`,
      imageResponse.status,
    );
  }

  const mediaType = normalizedContentType(imageResponse);
  if (!mediaType.startsWith("image/")) {
    throw new PublicChallengeSocialProviderError(
      "x",
      `Challenge image for X returned unsupported content type ${
        mediaType || "unknown"
      }.`,
    );
  }

  const mediaBytes = await imageResponse.arrayBuffer();
  if (!mediaBytes.byteLength) {
    throw new PublicChallengeSocialProviderError(
      "x",
      "Challenge image for X was empty.",
    );
  }
  if (mediaBytes.byteLength > X_IMAGE_MAX_BYTES) {
    throw new PublicChallengeSocialProviderError(
      "x",
      "Challenge image for X exceeds the 5 MB tweet_image limit.",
    );
  }

  const initializeUrl = `${args.base}/media/upload/initialize`;
  const initializeResponse = await requireOk(
    "x",
    await args.fetcher(initializeUrl, {
      method: "POST",
      headers: xOAuth1Headers({
        method: "POST",
        url: initializeUrl,
        credentials: args.credentials,
        contentType: "application/json",
      }),
      body: JSON.stringify({
        total_bytes: mediaBytes.byteLength,
        media_type: mediaType,
        media_category: "tweet_image",
      }),
      cache: "no-store",
    }),
  );

  const initialized = (await initializeResponse.json()) as {
    data?: { id?: unknown };
  };
  const mediaId =
    typeof initialized.data?.id === "string"
      ? initialized.data.id
      : "";
  if (!mediaId) {
    throw new PublicChallengeSocialProviderError(
      "x",
      "X returned no media ID while initializing the challenge image upload.",
    );
  }

  const form = new FormData();
  form.append("segment_index", "0");
  form.append(
    "media",
    new Blob([mediaBytes], { type: mediaType }),
    xImageFilename(mediaType),
  );

  const appendUrl = `${args.base}/media/upload/${encodeURIComponent(
    mediaId,
  )}/append`;
  await requireOk(
    "x",
    await args.fetcher(appendUrl, {
      method: "POST",
      headers: xOAuth1Headers({
        method: "POST",
        url: appendUrl,
        credentials: args.credentials,
      }),
      body: form,
      cache: "no-store",
    }),
  );

  const finalizeUrl = `${args.base}/media/upload/${encodeURIComponent(
    mediaId,
  )}/finalize`;
  const finalizeResponse = await requireOk(
    "x",
    await args.fetcher(finalizeUrl, {
      method: "POST",
      headers: xOAuth1Headers({
        method: "POST",
        url: finalizeUrl,
        credentials: args.credentials,
      }),
      cache: "no-store",
    }),
  );

  const finalized = (await finalizeResponse.json().catch(() => null)) as
    | {
        data?: {
          id?: unknown;
          processing_info?: {
            state?: unknown;
            error?: { message?: unknown };
          };
        };
      }
    | null;

  const processingState =
    typeof finalized?.data?.processing_info?.state === "string"
      ? finalized.data.processing_info.state
      : "";
  if (processingState === "failed") {
    const detail = finalized?.data?.processing_info?.error?.message;
    throw new PublicChallengeSocialProviderError(
      "x",
      typeof detail === "string" && detail.trim()
        ? detail
        : "X failed to process the challenge image.",
    );
  }
  if (processingState && processingState !== "succeeded") {
    throw new PublicChallengeSocialProviderError(
      "x",
      `X challenge image processing is not ready (${processingState}).`,
    );
  }

  return mediaId;
}

const TIKTOK_PRIVACY_LEVELS = new Set([
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
]);

function tiktokApiBase(env: Environment) {
  return (value(env, "TIKTOK_API_BASE") || "https://open.tiktokapis.com").replace(/\/$/, "");
}

function tiktokDescription(content: PublicChallengeSocialContent) {
  // TikTok requires preset text, including hashtags, to remain user-editable.
  // The manual admin composer supplies the final reviewed description.
  return content.description.trim().slice(0, 4000);
}

function tiktokPayloadError(payload: {
  error?: { code?: unknown; message?: unknown };
} | null) {
  const code = typeof payload?.error?.code === "string" ? payload.error.code : "";
  if (!code || code === "ok") return null;
  const message =
    typeof payload?.error?.message === "string"
      ? payload.error.message.trim()
      : "";
  return message || `TikTok returned ${code}.`;
}

async function publishTikTok(
  content: PublicChallengeSocialContent,
  env: Environment,
  fetcher: Fetcher,
): Promise<PublicChallengeSocialProviderResult> {
  const token = (await getTikTokPublisherAccessToken({ env, fetcher })) || "";
  const privacyLevel = value(env, "TIKTOK_PRIVACY_LEVEL");
  if (!configured(token, privacyLevel)) {
    throw new PublicChallengeSocialProviderError(
      "tiktok",
      "TikTok publishing credentials are not configured.",
    );
  }
  if (!TIKTOK_PRIVACY_LEVELS.has(privacyLevel)) {
    throw new PublicChallengeSocialProviderError(
      "tiktok",
      "TIKTOK_PRIVACY_LEVEL is not supported.",
    );
  }
  if (
    privacyLevel !== "SELF_ONLY" &&
    !enabledFlag(env, "TIKTOK_DIRECT_POST_AUDITED")
  ) {
    throw new PublicChallengeSocialProviderError(
      "tiktok",
      "TikTok unaudited clients must publish with SELF_ONLY privacy.",
    );
  }
  if (!content.imageUrl) {
    throw new PublicChallengeSocialProviderError(
      "tiktok",
      "TikTok requires a public, TikTok-safe challenge image.",
    );
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=UTF-8",
  };
  const creatorResponse = await requireOk(
    "tiktok",
    await fetcher(`${tiktokApiBase(env)}/v2/post/publish/creator_info/query/`, {
      method: "POST",
      headers,
      cache: "no-store",
    }),
  );
  const creatorPayload = (await creatorResponse.json()) as {
    data?: { privacy_level_options?: unknown; comment_disabled?: unknown };
    error?: { code?: unknown; message?: unknown };
  };
  const creatorError = tiktokPayloadError(creatorPayload);
  if (creatorError) {
    throw new PublicChallengeSocialProviderError("tiktok", creatorError);
  }
  const privacyOptions = Array.isArray(creatorPayload.data?.privacy_level_options)
    ? creatorPayload.data.privacy_level_options.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  if (!privacyOptions.includes(privacyLevel)) {
    throw new PublicChallengeSocialProviderError(
      "tiktok",
      `TikTok creator does not allow privacy level ${privacyLevel}.`,
    );
  }

  const publishResponse = await requireOk(
    "tiktok",
    await fetcher(`${tiktokApiBase(env)}/v2/post/publish/content/init/`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        media_type: "PHOTO",
        post_mode: "DIRECT_POST",
        post_info: {
          title: content.title.trim().slice(0, 90),
          description: tiktokDescription(content),
          privacy_level: privacyLevel,
          disable_comment: creatorPayload.data?.comment_disabled === true,
          auto_add_music: false,
          brand_content_toggle: false,
          brand_organic_toggle: true,
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_cover_index: 0,
          photo_images: [content.imageUrl],
        },
      }),
      cache: "no-store",
    }),
  );
  const publishPayload = (await publishResponse.json()) as {
    data?: { publish_id?: unknown };
    error?: { code?: unknown; message?: unknown };
  };
  const publishError = tiktokPayloadError(publishPayload);
  if (publishError) {
    throw new PublicChallengeSocialProviderError("tiktok", publishError);
  }
  const id =
    typeof publishPayload.data?.publish_id === "string"
      ? publishPayload.data.publish_id
      : "";
  if (!id) {
    throw new PublicChallengeSocialProviderError(
      "tiktok",
      "TikTok returned no publish ID.",
    );
  }
  return { providerPostId: id, providerPostUrl: null };
}

async function publishX(
  content: PublicChallengeSocialContent,
  env: Environment,
  fetcher: Fetcher,
): Promise<PublicChallengeSocialProviderResult> {
  const credentials = xOAuth1Credentials(env);
  if (!content.imageUrl) {
    throw new PublicChallengeSocialProviderError(
      "x",
      "X requires a public challenge image.",
    );
  }

  const base = (value(env, "X_API_BASE") || "https://api.x.com/2").replace(
    /\/$/,
    "",
  );
  const mediaId = await uploadXImage({
    imageUrl: content.imageUrl,
    credentials,
    base,
    fetcher,
  });

  const postUrl = `${base}/tweets`;
  const response = await requireOk(
    "x",
    await fetcher(postUrl, {
      method: "POST",
      headers: xOAuth1Headers({
        method: "POST",
        url: postUrl,
        credentials,
        contentType: "application/json",
      }),
      body: JSON.stringify({
        text: xText(content),
        media: { media_ids: [mediaId] },
      }),
      cache: "no-store",
    }),
  );
  const payload = (await response.json()) as { data?: { id?: unknown } };
  const id = typeof payload.data?.id === "string" ? payload.data.id : "";
  if (!id) {
    throw new PublicChallengeSocialProviderError(
      "x",
      "X returned no post ID.",
    );
  }
  const username = value(env, "X_USERNAME").replace(/^@/, "");
  return {
    providerPostId: id,
    providerPostUrl: username
      ? `https://x.com/${username}/status/${id}`
      : null,
  };
}

type RedditPostRequirements = {
  body_restriction_policy?: "required" | "notAllowed" | "none";
  body_text_max_length?: number | null;
  body_text_min_length?: number | null;
  domain_blacklist?: string[];
  domain_whitelist?: string[];
  is_flair_required?: boolean;
  title_text_max_length?: number | null;
  title_text_min_length?: number | null;
};

function redditApiBase(env: Environment) {
  return (value(env, "REDDIT_API_BASE") || "https://oauth.reddit.com").replace(/\/$/, "");
}

async function redditAccessToken(env: Environment, fetcher: Fetcher) {
  const direct = value(env, "REDDIT_ACCESS_TOKEN");
  if (direct) return direct;

  const clientId = value(env, "REDDIT_CLIENT_ID");
  const clientSecret = value(env, "REDDIT_CLIENT_SECRET");
  const refreshToken = value(env, "REDDIT_REFRESH_TOKEN");
  const userAgent = value(env, "REDDIT_USER_AGENT");
  if (!configured(clientId, clientSecret, refreshToken, userAgent)) {
    throw new PublicChallengeSocialProviderError(
      "reddit",
      "Reddit OAuth credentials are not configured.",
    );
  }

  const response = await requireOk(
    "reddit",
    await fetcher("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    }),
  );
  const payload = (await response.json()) as { access_token?: unknown };
  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) {
    throw new PublicChallengeSocialProviderError(
      "reddit",
      "Reddit returned no OAuth access token.",
    );
  }
  return accessToken;
}

function redditBody(content: PublicChallengeSocialContent) {
  return [
    content.description.trim(),
    `Try the challenge: ${content.challengeUrl.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function redditDomainMatches(host: string, candidate: string) {
  const left = host.toLowerCase().replace(/^www\./, "");
  const right = candidate.toLowerCase().replace(/^www\./, "");
  return left === right || left.endsWith(`.${right}`);
}

async function publishReddit(
  content: PublicChallengeSocialContent,
  env: Environment,
  fetcher: Fetcher,
): Promise<PublicChallengeSocialProviderResult> {
  if (!enabledFlag(env, "REDDIT_COMMERCIAL_API_APPROVED")) {
    throw new PublicChallengeSocialProviderError(
      "reddit",
      "Reddit commercial API approval is required before ZoeSkoul automatic posting can be enabled.",
    );
  }

  const subreddit = value(env, "REDDIT_SUBREDDIT").replace(/^r\//i, "");
  const userAgent = value(env, "REDDIT_USER_AGENT");
  if (!configured(subreddit, userAgent)) {
    throw new PublicChallengeSocialProviderError(
      "reddit",
      "Reddit subreddit and User-Agent are not configured.",
    );
  }

  const token = await redditAccessToken(env, fetcher);
  const oauthHeaders = {
    Authorization: `Bearer ${token}`,
    "User-Agent": userAgent,
  };
  const requirementsResponse = await requireOk(
    "reddit",
    await fetcher(
      `${redditApiBase(env)}/api/v1/${encodeURIComponent(subreddit)}/post_requirements`,
      { method: "GET", headers: oauthHeaders, cache: "no-store" },
    ),
  );
  const requirements = (await requirementsResponse.json()) as RedditPostRequirements;

  let title = content.title.trim();
  const titleMax =
    typeof requirements.title_text_max_length === "number"
      ? requirements.title_text_max_length
      : 300;
  title = title.slice(0, titleMax).trimEnd();
  const titleMin =
    typeof requirements.title_text_min_length === "number"
      ? requirements.title_text_min_length
      : 0;
  if (title.length < titleMin) {
    throw new PublicChallengeSocialProviderError(
      "reddit",
      `r/${subreddit} requires a title of at least ${titleMin} characters.`,
    );
  }

  const flairId = value(env, "REDDIT_FLAIR_ID");
  if (requirements.is_flair_required && !flairId) {
    throw new PublicChallengeSocialProviderError(
      "reddit",
      `r/${subreddit} requires post flair; configure REDDIT_FLAIR_ID.`,
    );
  }

  const form = new URLSearchParams({
    api_type: "json",
    sr: subreddit,
    title,
    resubmit: "true",
    validate_on_submit: "true",
  });
  if (flairId) form.set("flair_id", flairId);

  if (requirements.body_restriction_policy === "notAllowed") {
    const host = new URL(content.challengeUrl).hostname;
    if (
      requirements.domain_whitelist?.length &&
      !requirements.domain_whitelist.some((domain) => redditDomainMatches(host, domain))
    ) {
      throw new PublicChallengeSocialProviderError(
        "reddit",
        `r/${subreddit} does not allow links from ${host}.`,
      );
    }
    if (
      requirements.domain_blacklist?.some((domain) => redditDomainMatches(host, domain))
    ) {
      throw new PublicChallengeSocialProviderError(
        "reddit",
        `r/${subreddit} blocks links from ${host}.`,
      );
    }
    form.set("kind", "link");
    form.set("url", content.challengeUrl);
  } else {
    const body = redditBody(content);
    const bodyMax =
      typeof requirements.body_text_max_length === "number"
        ? requirements.body_text_max_length
        : body.length;
    const finalBody = body.slice(0, bodyMax).trimEnd();
    const bodyMin =
      typeof requirements.body_text_min_length === "number"
        ? requirements.body_text_min_length
        : 0;
    if (finalBody.length < bodyMin) {
      throw new PublicChallengeSocialProviderError(
        "reddit",
        `r/${subreddit} requires a body of at least ${bodyMin} characters.`,
      );
    }
    form.set("kind", "self");
    form.set("text", finalBody);
  }

  const response = await requireOk(
    "reddit",
    await fetcher(`${redditApiBase(env)}/api/submit`, {
      method: "POST",
      headers: {
        ...oauthHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      cache: "no-store",
    }),
  );
  const payload = (await response.json()) as {
    json?: {
      errors?: unknown;
      data?: { id?: unknown; name?: unknown; url?: unknown };
    };
  };
  const errors = Array.isArray(payload.json?.errors) ? payload.json.errors : [];
  if (errors.length) {
    throw new PublicChallengeSocialProviderError(
      "reddit",
      `Reddit rejected the post: ${JSON.stringify(errors).slice(0, 600)}`,
    );
  }
  const id =
    typeof payload.json?.data?.name === "string"
      ? payload.json.data.name
      : typeof payload.json?.data?.id === "string"
        ? payload.json.data.id
        : "";
  if (!id) {
    throw new PublicChallengeSocialProviderError(
      "reddit",
      "Reddit returned no post ID.",
    );
  }
  return {
    providerPostId: id,
    providerPostUrl:
      typeof payload.json?.data?.url === "string" ? payload.json.data.url : null,
  };
}

export async function publishPublicChallengeToProvider(
  provider: PublicChallengeSocialProvider,
  content: PublicChallengeSocialContent,
  options: { env?: Environment; fetcher?: Fetcher } = {},
): Promise<PublicChallengeSocialProviderResult> {
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;

  switch (provider) {
    case "facebook":
      return publishFacebook(content, env, fetcher);
    case "instagram":
      return publishInstagram(content, env, fetcher);
    case "linkedin":
      return publishLinkedIn(content, env, fetcher);
    case "x":
      return publishX(content, env, fetcher);
    case "threads":
      return publishThreads(content, env, fetcher);
    case "reddit":
      return publishReddit(content, env, fetcher);
    case "tiktok":
      return publishTikTok(content, env, fetcher);
  }
}
