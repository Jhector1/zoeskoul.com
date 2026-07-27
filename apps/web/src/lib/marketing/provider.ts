import "server-only";

import { beehiivMarketingProvider } from "@/lib/marketing/beehiiv";
import { brevoMarketingProvider } from "@/lib/marketing/brevo";

export type MarketingProviderName = "brevo" | "beehiiv";

export type MarketingProviderSyncResult =
  | {
      ok: true;
      provider: MarketingProviderName;
      externalContactId: string | null;
      status: string | null;
    }
  | {
      ok: false;
      provider: MarketingProviderName | "manual";
      reason: "not_configured" | "invalid_email" | "provider_error";
      detail?: string;
    };

export type MarketingSubscribeArgs = {
  email: string;
  consentSource: string;
};

export type MarketingUnsubscribeArgs = {
  email: string;
  externalContactId?: string | null;
};

export type MarketingProviderAdapter = {
  name: MarketingProviderName;
  subscribe(args: MarketingSubscribeArgs): Promise<MarketingProviderSyncResult>;
  unsubscribe(
    args: MarketingUnsubscribeArgs,
  ): Promise<MarketingProviderSyncResult>;
};

type MarketingProviderEnvironment = {
  MARKETING_EMAIL_PROVIDER?: string;
};

export function parseMarketingProviderName(
  value: string | null | undefined,
): MarketingProviderName | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "brevo" || normalized === "beehiiv") {
    return normalized;
  }
  return null;
}

export function getMarketingProviderByName(
  name: MarketingProviderName,
): MarketingProviderAdapter {
  return name === "brevo" ? brevoMarketingProvider : beehiivMarketingProvider;
}

export function getConfiguredMarketingProvider(
  env: MarketingProviderEnvironment = process.env,
): MarketingProviderAdapter | null {
  const name = parseMarketingProviderName(env.MARKETING_EMAIL_PROVIDER);
  return name ? getMarketingProviderByName(name) : null;
}
