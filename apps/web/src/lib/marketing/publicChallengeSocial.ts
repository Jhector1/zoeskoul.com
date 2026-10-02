import "server-only";

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
  options: { xConfigured?: boolean } = {},
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
      configured:
        options.xConfigured ??
        configured(value(env, "X_USER_ACCESS_TOKEN")),
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
    const detail =
      parsed.error?.message ||
      parsed.detail ||
      parsed.errors?.[0]?.detail ||
      parsed.errors?.[0]?.message ||
      parsed.title ||
      body.slice(0, 600);
    return parsed.title && detail !== parsed.title
      ? `${parsed.title}: ${detail}`
      : detail;
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
  token: string;
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

  const authorization = {
    Authorization: `Bearer ${args.token}`,
  };

  const mediaUploadUrl = `${args.base}/media/upload`;
  const initializeUrl = new URL(mediaUploadUrl);
  initializeUrl.searchParams.set("command", "INIT");
  initializeUrl.searchParams.set(
    "total_bytes",
    String(mediaBytes.byteLength),
  );
  initializeUrl.searchParams.set("media_type", mediaType);
  initializeUrl.searchParams.set("media_category", "tweet_image");

  const initializeResponse = await requireOk(
    "x",
    await args.fetcher(initializeUrl, {
      method: "POST",
      headers: authorization,
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
  form.append("command", "APPEND");
  form.append("media_id", mediaId);
  form.append("segment_index", "0");
  form.append(
    "media",
    new Blob([mediaBytes], { type: mediaType }),
    xImageFilename(mediaType),
  );

  await requireOk(
    "x",
    await args.fetcher(mediaUploadUrl, {
      method: "POST",
      headers: authorization,
      body: form,
      cache: "no-store",
    }),
  );

  const finalizeUrl = new URL(mediaUploadUrl);
  finalizeUrl.searchParams.set("command", "FINALIZE");
  finalizeUrl.searchParams.set("media_id", mediaId);

  const finalizeResponse = await requireOk(
    "x",
    await args.fetcher(finalizeUrl, {
      method: "POST",
      headers: authorization,
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
  tokenOverride?: string,
): Promise<PublicChallengeSocialProviderResult> {
  const token = tokenOverride?.trim() || value(env, "X_USER_ACCESS_TOKEN");
  if (!token) {
    throw new PublicChallengeSocialProviderError(
      "x",
      "X user access token is not configured.",
    );
  }
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
    token,
    base,
    fetcher,
  });

  const response = await requireOk(
    "x",
    await fetcher(`${base}/tweets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
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
  options: {
    env?: Environment;
    fetcher?: Fetcher;
    xAccessToken?: string;
  } = {},
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
      return publishX(
        content,
        env,
        fetcher,
        options.xAccessToken,
      );
  }
}
