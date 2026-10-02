import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import type {
  PublicChallengeSocialProvider,
  PublicChallengeSocialProviderStatus,
} from "@zoeskoul/api-contracts";

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

export function publicChallengeSocialProviderStatuses(
  env: Environment = process.env,
): PublicChallengeSocialProviderStatus[] {
  return [
    {
      provider: "facebook",
      label: "Facebook",
      configured: configured(
        value(env, "META_GRAPH_API_VERSION"),
        value(env, "FACEBOOK_PAGE_ID"),
        value(env, "FACEBOOK_PAGE_ACCESS_TOKEN"),
      ),
      imageRequired: false,
    },
    {
      provider: "instagram",
      label: "Instagram",
      configured: configured(
        value(env, "META_GRAPH_API_VERSION"),
        value(env, "INSTAGRAM_BUSINESS_ACCOUNT_ID"),
        value(env, "INSTAGRAM_ACCESS_TOKEN"),
      ),
      imageRequired: true,
    },
    {
      provider: "linkedin",
      label: "LinkedIn",
      configured: configured(
        value(env, "LINKEDIN_VERSION"),
        value(env, "LINKEDIN_ACCESS_TOKEN"),
        value(env, "LINKEDIN_AUTHOR_URN"),
      ),
      imageRequired: false,
    },
    {
      provider: "x",
      label: "X",
      configured: configured(
        value(env, "X_API_KEY"),
        value(env, "X_API_SECRET"),
        value(env, "X_ACCESS_TOKEN"),
        value(env, "X_ACCESS_TOKEN_SECRET"),
      ),
      imageRequired: true,
    },
  ];
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
  }
}
