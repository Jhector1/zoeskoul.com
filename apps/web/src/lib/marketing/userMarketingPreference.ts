import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getConfiguredMarketingProvider,
  getMarketingProviderByName,
  parseMarketingProviderName,
  type MarketingProviderAdapter,
  type MarketingProviderName,
  type MarketingProviderSyncResult,
} from "@/lib/marketing/provider";

export type MarketingConsentSource =
  | "authentication"
  | "profile"
  | "post_auth_prompt";

export type PublicMarketingPreference = {
  marketingEmails: boolean;
  consentAt: string | null;
  consentSource: string | null;
  declinedAt: string | null;
  unsubscribedAt: string | null;
  provider: MarketingProviderName | null;
  syncStatus: string | null;
  syncedAt: string | null;
};

export type MarketingPreferenceUpdateResult = {
  preference: PublicMarketingPreference;
  syncStatus: "synced" | "pending" | "not_configured";
};

type ApplyUserMarketingPreferenceArgs = {
  userId: string;
  email: string;
  enabled: boolean;
  source: MarketingConsentSource;
};

type StoredPreference = {
  marketingEmails: boolean;
  consentAt: Date | null;
  consentSource: string | null;
  declinedAt: Date | null;
  unsubscribedAt: Date | null;
  provider: string | null;
  externalContactId: string | null;
  syncStatus: string | null;
  syncedAt: Date | null;
};

function toPublicPreference(
  preference: Omit<StoredPreference, "externalContactId">,
): PublicMarketingPreference {
  return {
    marketingEmails: preference.marketingEmails,
    consentAt: preference.consentAt?.toISOString() ?? null,
    consentSource: preference.consentSource,
    declinedAt: preference.declinedAt?.toISOString() ?? null,
    unsubscribedAt: preference.unsubscribedAt?.toISOString() ?? null,
    provider: parseMarketingProviderName(preference.provider),
    syncStatus: preference.syncStatus,
    syncedAt: preference.syncedAt?.toISOString() ?? null,
  };
}

function syncFailureStatus(
  result: Extract<MarketingProviderSyncResult, { ok: false }>,
) {
  return result.reason === "not_configured" ? "not_configured" : "error";
}

function manualNotConfigured(): MarketingProviderSyncResult {
  return { ok: false, provider: "manual", reason: "not_configured" };
}

function storedProvider(
  preference: Pick<StoredPreference, "provider"> | null,
): MarketingProviderAdapter | null {
  const name = parseMarketingProviderName(preference?.provider);
  return name ? getMarketingProviderByName(name) : null;
}

export function defaultPublicMarketingPreference(): PublicMarketingPreference {
  return {
    marketingEmails: false,
    consentAt: null,
    consentSource: null,
    declinedAt: null,
    unsubscribedAt: null,
    provider: null,
    syncStatus: null,
    syncedAt: null,
  };
}

export async function applyUserMarketingPreference(
  args: ApplyUserMarketingPreferenceArgs,
): Promise<MarketingPreferenceUpdateResult> {
  const now = new Date();
  const existing = await prisma.userMarketingPreference.findUnique({
    where: { userId: args.userId },
    select: {
      marketingEmails: true,
      consentAt: true,
      consentSource: true,
      declinedAt: true,
      unsubscribedAt: true,
      provider: true,
      externalContactId: true,
      syncStatus: true,
      syncedAt: true,
    },
  });

  const configuredProvider = getConfiguredMarketingProvider();
  const provider = args.enabled
    ? configuredProvider
    : storedProvider(existing) ?? configuredProvider;
  const wasSubscribed = existing?.marketingEmails === true;
  const needsProviderCall = args.enabled || wasSubscribed;

  const localPreference = await prisma.userMarketingPreference.upsert({
    where: { userId: args.userId },
    create: {
      userId: args.userId,
      marketingEmails: args.enabled,
      consentAt: args.enabled ? now : null,
      consentSource: args.enabled ? args.source : null,
      declinedAt: args.enabled ? null : now,
      unsubscribedAt: null,
      provider: provider?.name ?? null,
      syncStatus: needsProviderCall ? "pending" : "inactive",
      syncError: null,
    },
    update: args.enabled
      ? {
          marketingEmails: true,
          consentAt: now,
          consentSource: args.source,
          declinedAt: null,
          unsubscribedAt: null,
          provider: provider?.name ?? existing?.provider ?? null,
          syncStatus: "pending",
          syncError: null,
        }
      : {
          marketingEmails: false,
          declinedAt: wasSubscribed ? existing?.declinedAt : now,
          unsubscribedAt: wasSubscribed ? now : existing?.unsubscribedAt,
          provider: provider?.name ?? existing?.provider ?? null,
          syncStatus: needsProviderCall ? "pending" : "inactive",
          syncError: null,
        },
  });

  if (!needsProviderCall) {
    return {
      preference: toPublicPreference(localPreference),
      syncStatus: "synced",
    };
  }

  const providerResult = provider
    ? args.enabled
      ? await provider.subscribe({
          email: args.email,
          consentSource: args.source,
        })
      : await provider.unsubscribe({
          email: args.email,
          externalContactId: existing?.externalContactId,
        })
    : manualNotConfigured();

  const saved = providerResult.ok
    ? await prisma.userMarketingPreference.update({
        where: { userId: args.userId },
        data: {
          provider: providerResult.provider,
          externalContactId:
            providerResult.externalContactId ??
            existing?.externalContactId ??
            localPreference.externalContactId ??
            undefined,
          syncStatus:
            providerResult.status ?? (args.enabled ? "active" : "inactive"),
          syncedAt: new Date(),
          syncError: null,
        },
      })
    : await prisma.userMarketingPreference.update({
        where: { userId: args.userId },
        data: {
          provider:
            providerResult.provider === "manual"
              ? localPreference.provider
              : providerResult.provider,
          syncStatus: syncFailureStatus(providerResult),
          syncError: providerResult.detail?.slice(0, 500) ?? null,
        },
      });

  return {
    preference: toPublicPreference(saved),
    syncStatus: providerResult.ok
      ? "synced"
      : providerResult.reason === "not_configured"
        ? "not_configured"
        : "pending",
  };
}
