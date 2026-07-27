import "server-only";

import type {
  MarketingProviderAdapter,
  MarketingProviderSyncResult,
} from "@/lib/marketing/provider";

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";
const DEFAULT_TIMEOUT_MS = 10_000;

type BeehiivSubscriptionPayload = {
  data?: {
    id?: unknown;
    status?: unknown;
  };
};

type BeehiivEnvironment = {
  BEEHIIV_API_KEY?: string;
  BEEHIIV_PUBLICATION_ID?: string;
};

type BeehiivRequestOptions = {
  env?: BeehiivEnvironment;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type SubscribeToBeehiivArgs = BeehiivRequestOptions & {
  email: string;
  consentSource: string;
};

type UnsubscribeFromBeehiivArgs = BeehiivRequestOptions & {
  email: string;
  subscriberId?: string | null;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

function resolveConfiguration(
  env: BeehiivEnvironment = process.env as BeehiivEnvironment,
) {
  const apiKey = env.BEEHIIV_API_KEY?.trim();
  const publicationId = env.BEEHIIV_PUBLICATION_ID?.trim();

  if (!apiKey || !publicationId) return null;
  return { apiKey, publicationId };
}

async function parsePayload(response: Response) {
  return (await response.json().catch(() => null)) as
    | BeehiivSubscriptionPayload
    | null;
}

function subscriptionResult(
  payload: BeehiivSubscriptionPayload | null,
): MarketingProviderSyncResult {
  const id =
    typeof payload?.data?.id === "string" ? payload.data.id.trim() : "";
  const status =
    typeof payload?.data?.status === "string"
      ? payload.data.status.trim()
      : "";

  return {
    ok: true,
    provider: "beehiiv",
    externalContactId: id || null,
    status: status || null,
  };
}

async function beehiivRequest(
  path: string,
  init: RequestInit,
  options: BeehiivRequestOptions,
): Promise<MarketingProviderSyncResult> {
  const config = resolveConfiguration(options.env);
  if (!config) {
    return { ok: false, provider: "manual", reason: "not_configured" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetchImpl(`${BEEHIIV_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        provider: "beehiiv",
        reason: "provider_error",
        detail: (await response.text()).slice(0, 500),
      };
    }

    return subscriptionResult(await parsePayload(response));
  } catch (error) {
    return {
      ok: false,
      provider: "beehiiv",
      reason: "provider_error",
      detail:
        error instanceof Error ? error.message : "Unknown Beehiiv API error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function subscribeToBeehiiv(
  args: SubscribeToBeehiivArgs,
): Promise<MarketingProviderSyncResult> {
  const email = normalizeEmail(args.email);
  if (!isValidEmail(email)) {
    return { ok: false, provider: "beehiiv", reason: "invalid_email" };
  }

  const config = resolveConfiguration(args.env);
  if (!config) {
    return { ok: false, provider: "manual", reason: "not_configured" };
  }

  return beehiivRequest(
    `/publications/${encodeURIComponent(config.publicationId)}/subscriptions`,
    {
      method: "POST",
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: false,
        utm_source: "zoeskoul",
        utm_medium: "product",
        utm_campaign: args.consentSource,
      }),
    },
    args,
  );
}

export async function unsubscribeFromBeehiiv(
  args: UnsubscribeFromBeehiivArgs,
): Promise<MarketingProviderSyncResult> {
  const email = normalizeEmail(args.email);
  if (!isValidEmail(email)) {
    return { ok: false, provider: "beehiiv", reason: "invalid_email" };
  }

  const config = resolveConfiguration(args.env);
  if (!config) {
    return { ok: false, provider: "manual", reason: "not_configured" };
  }

  const path = args.subscriberId?.trim()
    ? `/publications/${encodeURIComponent(config.publicationId)}/subscriptions/${encodeURIComponent(args.subscriberId.trim())}`
    : `/publications/${encodeURIComponent(config.publicationId)}/subscriptions/by_email/${encodeURIComponent(email)}`;

  return beehiivRequest(
    path,
    {
      method: "PUT",
      body: JSON.stringify({ unsubscribe: true }),
    },
    args,
  );
}

export const beehiivMarketingProvider: MarketingProviderAdapter = {
  name: "beehiiv",
  subscribe: ({ email, consentSource }) =>
    subscribeToBeehiiv({ email, consentSource }),
  unsubscribe: ({ email, externalContactId }) =>
    unsubscribeFromBeehiiv({ email, subscriberId: externalContactId }),
};
