import "server-only";

import type {
  MarketingProviderAdapter,
  MarketingProviderSyncResult,
} from "@/lib/marketing/provider";

const BREVO_API_BASE = "https://api.brevo.com/v3";
const DEFAULT_TIMEOUT_MS = 10_000;

type BrevoEnvironment = {
  BREVO_API_KEY?: string;
  BREVO_MARKETING_LIST_ID?: string;
};

type BrevoRequestOptions = {
  env?: BrevoEnvironment;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type SubscribeToBrevoArgs = BrevoRequestOptions & {
  email: string;
};

type UnsubscribeFromBrevoArgs = BrevoRequestOptions & {
  email: string;
};

type BrevoContactPayload = {
  id?: unknown;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

function resolveConfiguration(
  env: BrevoEnvironment = process.env as BrevoEnvironment,
) {
  const apiKey = env.BREVO_API_KEY?.trim();
  const rawListId = env.BREVO_MARKETING_LIST_ID?.trim();
  const listId = rawListId && /^\d+$/.test(rawListId) ? Number(rawListId) : NaN;

  if (!apiKey || !Number.isSafeInteger(listId) || listId <= 0) return null;
  return { apiKey, listId };
}

async function brevoRequest(
  path: string,
  init: RequestInit,
  options: BrevoRequestOptions,
): Promise<Response | MarketingProviderSyncResult> {
  const config = resolveConfiguration(options.env);
  if (!config) {
    return {
      ok: false,
      provider: "manual",
      reason: "not_configured",
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    return await fetchImpl(`${BREVO_API_BASE}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "api-key": config.apiKey,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    return {
      ok: false,
      provider: "brevo",
      reason: "provider_error",
      detail: error instanceof Error ? error.message : "Unknown Brevo API error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function subscribeToBrevo(
  args: SubscribeToBrevoArgs,
): Promise<MarketingProviderSyncResult> {
  const email = normalizeEmail(args.email);
  if (!isValidEmail(email)) {
    return { ok: false, provider: "brevo", reason: "invalid_email" };
  }

  const config = resolveConfiguration(args.env);
  if (!config) {
    return { ok: false, provider: "manual", reason: "not_configured" };
  }

  const response = await brevoRequest(
    "/contacts",
    {
      method: "POST",
      body: JSON.stringify({
        email,
        listIds: [config.listId],
        updateEnabled: true,
        getId: true,
        emailBlacklisted: false,
      }),
    },
    args,
  );

  if (!(response instanceof Response)) return response;

  if (!response.ok) {
    return {
      ok: false,
      provider: "brevo",
      reason: "provider_error",
      detail: (await response.text()).slice(0, 500),
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | BrevoContactPayload
    | null;
  const id =
    typeof payload?.id === "number" || typeof payload?.id === "string"
      ? String(payload.id).trim()
      : "";

  return {
    ok: true,
    provider: "brevo",
    externalContactId: id || null,
    status: "active",
  };
}

export async function unsubscribeFromBrevo(
  args: UnsubscribeFromBrevoArgs,
): Promise<MarketingProviderSyncResult> {
  const email = normalizeEmail(args.email);
  if (!isValidEmail(email)) {
    return { ok: false, provider: "brevo", reason: "invalid_email" };
  }

  const config = resolveConfiguration(args.env);
  if (!config) {
    return { ok: false, provider: "manual", reason: "not_configured" };
  }

  const response = await brevoRequest(
    `/contacts/${encodeURIComponent(email)}`,
    {
      method: "PUT",
      body: JSON.stringify({ unlinkListIds: [config.listId] }),
    },
    args,
  );

  if (!(response instanceof Response)) return response;

  if (!response.ok && response.status !== 404) {
    return {
      ok: false,
      provider: "brevo",
      reason: "provider_error",
      detail: (await response.text()).slice(0, 500),
    };
  }

  return {
    ok: true,
    provider: "brevo",
    externalContactId: null,
    status: "inactive",
  };
}

export const brevoMarketingProvider: MarketingProviderAdapter = {
  name: "brevo",
  subscribe: ({ email }) => subscribeToBrevo({ email }),
  unsubscribe: ({ email }) => unsubscribeFromBrevo({ email }),
};
