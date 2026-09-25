import "server-only";

import type {
  PublicChallengeSocialProvider,
  PublicChallengeSocialProviderStatus,
} from "@zoeskoul/api-contracts";

export type PublicChallengeSocialContent = {
  title: string;
  description: string;
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
      configured: configured(value(env, "X_USER_ACCESS_TOKEN")),
      imageRequired: false,
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

function caption(content: PublicChallengeSocialContent) {
  return [content.title, content.description, content.challengeUrl]
    .filter(Boolean)
    .join("\n\n");
}

function xText(content: PublicChallengeSocialContent) {
  const suffix = `\n${content.challengeUrl}`;
  const room = Math.max(0, 280 - suffix.length);
  const title = content.title.trim();
  const prefix =
    title.length <= room
      ? title
      : `${title.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  return `${prefix}${suffix}`;
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

async function publishX(
  content: PublicChallengeSocialContent,
  env: Environment,
  fetcher: Fetcher,
): Promise<PublicChallengeSocialProviderResult> {
  const token = value(env, "X_USER_ACCESS_TOKEN");
  if (!token) {
    throw new PublicChallengeSocialProviderError(
      "x",
      "X user access token is not configured.",
    );
  }

  const base = value(env, "X_API_BASE") || "https://api.x.com/2";
  const response = await requireOk(
    "x",
    await fetcher(`${base.replace(/\/$/, "")}/tweets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: xText(content) }),
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
