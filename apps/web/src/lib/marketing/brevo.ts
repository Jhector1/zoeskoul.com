import "server-only";

import type {
  MarketingProviderAdapter,
  MarketingProviderSyncResult,
} from "@/lib/marketing/provider";
import {
  brevoApiFetch,
  brevoApiJson,
  getBrevoDefaultMarketingListId,
  hasBrevoApiKey,
  isValidBrevoEmail,
  normalizeBrevoEmail,
  type BrevoApiRequestOptions,
} from "@/lib/marketing/brevoApi";

type SubscribeToBrevoArgs = BrevoApiRequestOptions & {
  email: string;
};

type UnsubscribeFromBrevoArgs = BrevoApiRequestOptions & {
  email: string;
};

type BrevoContactPayload = {
  id?: unknown;
};

function configuredList(
  options: BrevoApiRequestOptions,
): number | null {
  if (!hasBrevoApiKey(options.env)) return null;
  return getBrevoDefaultMarketingListId(options.env);
}

function providerError(error: unknown): MarketingProviderSyncResult {
  return {
    ok: false,
    provider: "brevo",
    reason: "provider_error",
    detail:
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Unknown Brevo API error",
  };
}

export async function subscribeToBrevo(
  args: SubscribeToBrevoArgs,
): Promise<MarketingProviderSyncResult> {
  const email = normalizeBrevoEmail(args.email);
  if (!isValidBrevoEmail(email)) {
    return { ok: false, provider: "brevo", reason: "invalid_email" };
  }

  const listId = configuredList(args);
  if (!listId) {
    return { ok: false, provider: "manual", reason: "not_configured" };
  }

  try {
    const payload = await brevoApiJson<BrevoContactPayload>(
      "/contacts",
      {
        method: "POST",
        body: JSON.stringify({
          email,
          listIds: [listId],
          updateEnabled: true,
          getId: true,
          emailBlacklisted: false,
        }),
      },
      args,
    );

    const id =
      typeof payload?.id === "number" ||
      typeof payload?.id === "string"
        ? String(payload.id).trim()
        : "";

    return {
      ok: true,
      provider: "brevo",
      externalContactId: id || null,
      status: "active",
    };
  } catch (error) {
    return providerError(error);
  }
}

export async function unsubscribeFromBrevo(
  args: UnsubscribeFromBrevoArgs,
): Promise<MarketingProviderSyncResult> {
  const email = normalizeBrevoEmail(args.email);
  if (!isValidBrevoEmail(email)) {
    return { ok: false, provider: "brevo", reason: "invalid_email" };
  }

  const listId = configuredList(args);
  if (!listId) {
    return { ok: false, provider: "manual", reason: "not_configured" };
  }

  try {
    const response = await brevoApiFetch(
      `/contacts/${encodeURIComponent(email)}`,
      {
        method: "PUT",
        body: JSON.stringify({ unlinkListIds: [listId] }),
      },
      args,
    );

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
  } catch (error) {
    return providerError(error);
  }
}

export const brevoMarketingProvider: MarketingProviderAdapter = {
  name: "brevo",
  subscribe: ({ email }) => subscribeToBrevo({ email }),
  unsubscribe: ({ email }) => unsubscribeFromBrevo({ email }),
};
