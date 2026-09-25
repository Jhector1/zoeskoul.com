import "server-only";

import { getProductionAppOrigin } from "@zoeskoul/app-config";
import type {
  PublicChallengeSocialAdminResponse,
  PublicChallengeSocialAutomationSettings,
  PublicChallengeSocialProvider,
  PublicChallengeSocialPublishResponse,
  PublicChallengeSocialPublishResult,
} from "@zoeskoul/api-contracts";

import { prisma } from "@/lib/prisma";
import {
  buildPublicChallengePresentation,
} from "@/lib/practice/challenges/presentation";
import {
  getActivePracticeChallengeLink,
  getLatestActivePracticeChallengeLink,
  practiceChallengePath,
} from "@/lib/practice/challenges/shortLink";
import {
  PublicChallengeSocialProviderError,
  publicChallengeSocialProviderStatuses,
  publicChallengeSocialSchedulerConfigured,
  publishPublicChallengeToProvider,
} from "@/lib/marketing/publicChallengeSocial";

const AUTOMATION_ID = "daily";
const PROVIDERS: PublicChallengeSocialProvider[] = [
  "facebook",
  "instagram",
  "linkedin",
  "x",
];
const STALE_PUBLISHING_MS = 15 * 60 * 1000;

type AutomationRow = {
  enabled: boolean;
  locale: string;
  localTime: string;
  timezone: string;
  facebookEnabled: boolean;
  instagramEnabled: boolean;
  linkedinEnabled: boolean;
  xEnabled: boolean;
};

function rowProviders(row: AutomationRow): PublicChallengeSocialProvider[] {
  return PROVIDERS.filter((provider) => {
    if (provider === "facebook") return row.facebookEnabled;
    if (provider === "instagram") return row.instagramEnabled;
    if (provider === "linkedin") return row.linkedinEnabled;
    return row.xEnabled;
  });
}

function rowSettings(
  row: AutomationRow,
): PublicChallengeSocialAutomationSettings {
  return {
    enabled: row.enabled,
    locale:
      row.locale === "fr" || row.locale === "ht"
        ? row.locale
        : "en",
    localTime: row.localTime,
    timezone: row.timezone,
    providers: rowProviders(row),
  };
}

function providerFlags(providers: PublicChallengeSocialProvider[]) {
  const selected = new Set(providers);
  return {
    facebookEnabled: selected.has("facebook"),
    instagramEnabled: selected.has("instagram"),
    linkedinEnabled: selected.has("linkedin"),
    xEnabled: selected.has("x"),
  };
}

export function isValidPublicChallengeSocialTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function localClock(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export function isPublicChallengeSocialAutomationDue(args: {
  enabled: boolean;
  localTime: string;
  timezone: string;
  now: Date;
}) {
  if (!args.enabled) return false;
  const clock = localClock(args.now, args.timezone);
  return clock.time >= args.localTime;
}

async function automationRow() {
  return prisma.publicChallengeSocialAutomation.upsert({
    where: { id: AUTOMATION_ID },
    update: {},
    create: { id: AUTOMATION_ID },
  });
}

export async function getPublicChallengeSocialAutomationSettings() {
  return rowSettings(await automationRow());
}

export async function updatePublicChallengeSocialAutomationSettings(
  input: PublicChallengeSocialAutomationSettings,
) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.localTime)) {
    throw new Error("Choose a valid daily posting time.");
  }
  if (!isValidPublicChallengeSocialTimezone(input.timezone)) {
    throw new Error("Choose a valid IANA timezone.");
  }

  const uniqueProviders = [...new Set(input.providers)];
  if (!uniqueProviders.length && input.enabled) {
    throw new Error(
      "Choose at least one social provider before enabling automation.",
    );
  }

  const configured = new Set(
    publicChallengeSocialProviderStatuses()
      .filter((provider) => provider.configured)
      .map((provider) => provider.provider),
  );
  const unavailable = uniqueProviders.filter(
    (provider) => !configured.has(provider),
  );

  if (input.enabled && unavailable.length) {
    throw new Error(
      `Configure ${unavailable.join(", ")} before enabling daily posting.`,
    );
  }
  if (input.enabled && !publicChallengeSocialSchedulerConfigured()) {
    throw new Error(
      "The production social scheduler secret is not configured.",
    );
  }

  const row = await prisma.publicChallengeSocialAutomation.upsert({
    where: { id: AUTOMATION_ID },
    create: {
      id: AUTOMATION_ID,
      enabled: input.enabled,
      locale: input.locale,
      localTime: input.localTime,
      timezone: input.timezone,
      ...providerFlags(uniqueProviders),
    },
    update: {
      enabled: input.enabled,
      locale: input.locale,
      localTime: input.localTime,
      timezone: input.timezone,
      ...providerFlags(uniqueProviders),
    },
  });

  return rowSettings(row);
}

function challengeUrl(challenge: { locale: string; code: string }) {
  return `${getProductionAppOrigin("website")}/${encodeURIComponent(
    challenge.locale,
  )}${practiceChallengePath(challenge.code)}`;
}

function utcDate(now: Date) {
  return now.toISOString().slice(0, 10);
}

async function claimPost(args: {
  challengeId: string;
  provider: PublicChallengeSocialProvider;
  dispatchDate: string;
  source: "manual" | "daily";
  idempotencyKey: string;
  now: Date;
}) {
  const existing = await prisma.publicChallengeSocialPost.upsert({
    where: { idempotencyKey: args.idempotencyKey },
    update: {},
    create: {
      challengeId: args.challengeId,
      provider: args.provider,
      dispatchDate: args.dispatchDate,
      source: args.source,
      status: "pending",
      idempotencyKey: args.idempotencyKey,
    },
  });

  if (existing.status === "published") {
    return { record: existing, claimed: false };
  }

  await prisma.publicChallengeSocialPost.updateMany({
    where: {
      id: existing.id,
      status: "publishing",
      updatedAt: {
        lt: new Date(args.now.getTime() - STALE_PUBLISHING_MS),
      },
    },
    data: {
      status: "failed",
      lastError: "Recovered a stale publishing claim.",
    },
  });

  const claim = await prisma.publicChallengeSocialPost.updateMany({
    where: {
      id: existing.id,
      status: { in: ["pending", "failed"] },
    },
    data: {
      status: "publishing",
      attemptCount: { increment: 1 },
      lastError: null,
    },
  });

  return {
    record: await prisma.publicChallengeSocialPost.findUniqueOrThrow({
      where: { id: existing.id },
    }),
    claimed: claim.count === 1,
  };
}

export async function publishChallengeToSocial(args: {
  challenge: {
    id: string;
    code: string;
    locale: string;
    exerciseKey: string;
    shareTitle: string | null;
    shareDescription: string | null;
    ogImagePublicId: string | null;
    ogImageAlt: string | null;
  };
  providers: PublicChallengeSocialProvider[];
  source: "manual" | "daily";
  dispatchDate: string;
  now?: Date;
}): Promise<PublicChallengeSocialPublishResponse> {
  const now = args.now ?? new Date();
  const configured = new Map(
    publicChallengeSocialProviderStatuses().map((status) => [
      status.provider,
      status.configured,
    ]),
  );
  const presentation = buildPublicChallengePresentation({
    source: args.challenge,
    fallbackTitle: args.challenge.shareTitle || args.challenge.exerciseKey,
  });

  const content = {
    title: presentation.title,
    description: presentation.description,
    challengeUrl: challengeUrl(args.challenge),
    imageUrl: presentation.imageUrl,
    imageAlt: presentation.imageAlt,
  };

  const results: PublicChallengeSocialPublishResult[] = [];

  for (const provider of [...new Set(args.providers)]) {
    if (!configured.get(provider)) {
      results.push({
        provider,
        status: "failed",
        providerPostId: null,
        providerPostUrl: null,
        error: `${provider} is not configured.`,
      });
      continue;
    }

    const idempotencyKey =
      args.source === "daily"
        ? `daily:${args.dispatchDate}:${provider}`
        : `manual:${args.dispatchDate}:${args.challenge.id}:${provider}`;

    const claim = await claimPost({
      challengeId: args.challenge.id,
      provider,
      dispatchDate: args.dispatchDate,
      source: args.source,
      idempotencyKey,
      now,
    });

    if (!claim.claimed) {
      results.push({
        provider,
        status: "skipped",
        providerPostId: claim.record.providerPostId,
        providerPostUrl: claim.record.providerPostUrl,
        error: null,
      });
      continue;
    }

    try {
      const published = await publishPublicChallengeToProvider(
        provider,
        content,
      );

      await prisma.publicChallengeSocialPost.update({
        where: { id: claim.record.id },
        data: {
          status: "published",
          providerPostId: published.providerPostId,
          providerPostUrl: published.providerPostUrl,
          publishedAt: now,
          lastError: null,
        },
      });

      results.push({
        provider,
        status: "published",
        providerPostId: published.providerPostId,
        providerPostUrl: published.providerPostUrl,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof PublicChallengeSocialProviderError ||
        error instanceof Error
          ? error.message
          : "Social provider request failed.";

      await prisma.publicChallengeSocialPost.update({
        where: { id: claim.record.id },
        data: {
          status: "failed",
          lastError: message.slice(0, 2000),
        },
      });

      results.push({
        provider,
        status: "failed",
        providerPostId: null,
        providerPostUrl: null,
        error: message,
      });
    }
  }

  return {
    ok: true,
    challengeCode: args.challenge.code,
    results,
  };
}

export async function publishActiveChallengeToSocial(args: {
  challengeCode: string;
  providers: PublicChallengeSocialProvider[];
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const challenge = await getActivePracticeChallengeLink(
    args.challengeCode,
  );
  if (!challenge) {
    throw new Error("Active public challenge not found.");
  }

  return publishChallengeToSocial({
    challenge,
    providers: args.providers,
    source: "manual",
    dispatchDate: utcDate(now),
    now,
  });
}

export async function runDailyPublicChallengeSocialTick(
  now = new Date(),
) {
  const settings = rowSettings(await automationRow());

  if (
    !isPublicChallengeSocialAutomationDue({
      enabled: settings.enabled,
      localTime: settings.localTime,
      timezone: settings.timezone,
      now,
    })
  ) {
    return { ok: true as const, action: "not_due" as const };
  }

  if (!settings.providers.length) {
    return { ok: true as const, action: "no_providers" as const };
  }

  const challenge = await getLatestActivePracticeChallengeLink(
    settings.locale,
  );
  if (!challenge || challenge.locale !== settings.locale) {
    return {
      ok: true as const,
      action: "no_active_challenge" as const,
    };
  }

  const clock = localClock(now, settings.timezone);
  return {
    action: "processed" as const,
    ...(await publishChallengeToSocial({
      challenge,
      providers: settings.providers,
      source: "daily",
      dispatchDate: clock.date,
      now,
    })),
  };
}

export async function getPublicChallengeSocialAdminState(): Promise<PublicChallengeSocialAdminResponse> {
  const [automation, recentPosts] = await Promise.all([
    getPublicChallengeSocialAutomationSettings(),
    prisma.publicChallengeSocialPost.findMany({
      take: 12,
      orderBy: { createdAt: "desc" },
      include: {
        challenge: {
          select: {
            code: true,
            shareTitle: true,
            exerciseKey: true,
          },
        },
      },
    }),
  ]);

  return {
    schedulerConfigured: publicChallengeSocialSchedulerConfigured(),
    providers: publicChallengeSocialProviderStatuses(),
    automation,
    recentPosts: recentPosts.map((post) => ({
      id: post.id,
      provider: post.provider as PublicChallengeSocialProvider,
      dispatchDate: post.dispatchDate,
      source: post.source as "manual" | "daily",
      status: post.status as
        | "pending"
        | "publishing"
        | "published"
        | "failed",
      providerPostId: post.providerPostId,
      providerPostUrl: post.providerPostUrl,
      attemptCount: post.attemptCount,
      lastError: post.lastError,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      challengeCode: post.challenge.code,
      challengeTitle:
        post.challenge.shareTitle || post.challenge.exerciseKey,
    })),
  };
}
