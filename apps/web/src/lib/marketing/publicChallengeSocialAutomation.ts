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
  practiceChallengePath,
} from "@/lib/practice/challenges/shortLink";
import {
  createOrReuseAutomatedPracticeChallenge,
  publicChallengeExerciseIdentity,
  type PublicChallengeLocale,
} from "@/lib/practice/challenges/automatedChallenge";
import {
  listPublishedChallengeExerciseOptions,
} from "@/lib/practice/challenges/publishedCatalog";
import {
  PublicChallengeSocialProviderError,
  publicChallengeSocialProviderStatuses,
  publicChallengeSocialSchedulerConfigured,
  publishPublicChallengeToProvider,
} from "@/lib/marketing/publicChallengeSocial";
import {
  resolvePublicChallengeSocialDescription,
} from "@/lib/marketing/publicChallengeSocialCopy";
import {
  getPublicChallengeAudienceList,
  listPublicChallengeAudienceLists,
  publicChallengeBrevoConfigured,
  sendPublicChallengeCampaignNow,
} from "@/lib/marketing/publicChallengeCampaign";

import { ensurePublicChallengeSocialImage } from "@/lib/practice/challenges/socialCard";

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
  emailEnabled: boolean;
  emailListId: number | null;
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
    emailEnabled: row.emailEnabled,
    emailListId: row.emailListId,
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
  if (
    !uniqueProviders.length &&
    !input.emailEnabled &&
    input.enabled
  ) {
    throw new Error(
      "Choose at least one social provider or enable Brevo email before enabling automation.",
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
  if (input.enabled && input.emailEnabled) {
    if (!publicChallengeBrevoConfigured()) {
      throw new Error(
        "Configure Brevo before enabling automatic challenge email.",
      );
    }
    if (!input.emailListId) {
      throw new Error(
        "Choose a Brevo audience list before enabling automatic challenge email.",
      );
    }
    await getPublicChallengeAudienceList(input.emailListId);
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
      emailEnabled: input.emailEnabled,
      emailListId: input.emailEnabled ? input.emailListId : null,
    },
    update: {
      enabled: input.enabled,
      locale: input.locale,
      localTime: input.localTime,
      timezone: input.timezone,
      ...providerFlags(uniqueProviders),
      emailEnabled: input.emailEnabled,
      emailListId: input.emailEnabled ? input.emailListId : null,
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

  if (
    existing.challengeId !== args.challengeId ||
    existing.provider !== args.provider ||
    existing.dispatchDate !== args.dispatchDate ||
    existing.source !== args.source
  ) {
    throw new Error(
      `Social post idempotency conflict for ${args.idempotencyKey}.`,
    );
  }

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
    subjectSlug: string;
    moduleSlug?: string | null;
    sectionSlug?: string | null;
    topicSlug: string;
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
  const challengeWithImage = await ensurePublicChallengeSocialImage(
    args.challenge,
  );
  const socialDescription =
    await resolvePublicChallengeSocialDescription(
      args.challenge,
    );

  const presentation =
    buildPublicChallengePresentation({
      source: {
        ...challengeWithImage,
        shareDescription:
          socialDescription,
      },
      fallbackTitle:
        args.challenge.shareTitle ||
        args.challenge.exerciseKey,
    });

  const content = {
    title: presentation.title,
    description:
      presentation.description,
    subjectSlug:
      args.challenge.subjectSlug,
    challengeUrl:
      challengeUrl(challengeWithImage),
    imageUrl:
      presentation.imageUrl,
    imageAlt:
      presentation.imageAlt,
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

type DailyExerciseHistoryItem = {
  dispatchDate: string;
  createdAt: Date;
  challenge: {
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    topicSlug: string;
    exerciseKey: string;
  };
};

function chooseNextSubjectRotatedOption(
  options: Awaited<ReturnType<typeof listPublishedChallengeExerciseOptions>>,
  history: DailyExerciseHistoryItem[],
) {
  const usedExerciseIds = new Set(
    history.map(({ challenge }) =>
      publicChallengeExerciseIdentity(challenge),
    ),
  );
  const remaining = options.filter(
    (option) =>
      !usedExerciseIds.has(
        publicChallengeExerciseIdentity(option),
      ),
  );
  if (!remaining.length) return null;

  const subjectOrder = Array.from(
    new Set(options.map((option) => option.subjectSlug)),
  );
  if (!subjectOrder.length) return remaining[0] ?? null;

  const orderedHistory = [...history].sort(
    (left, right) =>
      left.dispatchDate.localeCompare(right.dispatchDate) ||
      left.createdAt.getTime() - right.createdAt.getTime(),
  );
  const lastSubjectSlug =
    orderedHistory.at(-1)?.challenge.subjectSlug ?? null;
  const lastIndex = lastSubjectSlug
    ? subjectOrder.indexOf(lastSubjectSlug)
    : -1;
  const startIndex =
    lastIndex >= 0 ? (lastIndex + 1) % subjectOrder.length : 0;

  for (let offset = 0; offset < subjectOrder.length; offset += 1) {
    const subjectSlug =
      subjectOrder[
        (startIndex + offset) % subjectOrder.length
      ];
    const candidate = remaining.find(
      (option) => option.subjectSlug === subjectSlug,
    );
    if (candidate) return candidate;
  }

  return remaining[0] ?? null;
}

async function getDailyExerciseHistory(): Promise<
  DailyExerciseHistoryItem[]
> {
  const [dispatches, legacyPublishedPosts] = await Promise.all([
    prisma.publicChallengeDailyDispatch.findMany({
      orderBy: [{ dispatchDate: "asc" }, { createdAt: "asc" }],
      select: {
        dispatchDate: true,
        createdAt: true,
        challenge: {
          select: {
            subjectSlug: true,
            moduleSlug: true,
            sectionSlug: true,
            topicSlug: true,
            exerciseKey: true,
          },
        },
      },
    }),
    prisma.publicChallengeSocialPost.findMany({
      where: {
        source: "daily",
        status: "published",
      },
      orderBy: [{ dispatchDate: "asc" }, { createdAt: "asc" }],
      select: {
        dispatchDate: true,
        createdAt: true,
        challenge: {
          select: {
            subjectSlug: true,
            moduleSlug: true,
            sectionSlug: true,
            topicSlug: true,
            exerciseKey: true,
          },
        },
      },
    }),
  ]);

  const byDispatchAndExercise = new Map<
    string,
    DailyExerciseHistoryItem
  >();

  for (const item of [...legacyPublishedPosts, ...dispatches]) {
    const key = [
      item.dispatchDate,
      publicChallengeExerciseIdentity(item.challenge),
    ].join("::");
    byDispatchAndExercise.set(key, item);
  }

  return [...byDispatchAndExercise.values()];
}

export async function getNextDailyPublicChallengeLink(
  locale: PublicChallengeLocale,
) {
  const [history, options] = await Promise.all([
    getDailyExerciseHistory(),
    listPublishedChallengeExerciseOptions(),
  ]);

  const candidate = chooseNextSubjectRotatedOption(
    options,
    history,
  );
  if (!candidate) return null;

  return createOrReuseAutomatedPracticeChallenge({
    locale,
    option: candidate,
  });
}

export async function getDailyPublicChallengeForDispatch(
  locale: PublicChallengeLocale,
  dispatchDate: string,
) {
  const existingDispatch =
    await prisma.publicChallengeDailyDispatch.findUnique({
      where: { dispatchDate },
      include: { challenge: true },
    });
  if (existingDispatch) {
    return existingDispatch.challenge;
  }

  const legacyDispatch =
    await prisma.publicChallengeSocialPost.findFirst({
      where: {
        source: "daily",
        dispatchDate,
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        challenge: true,
      },
    });

  if (legacyDispatch) {
    const claimed =
      await prisma.publicChallengeDailyDispatch.upsert({
        where: { dispatchDate },
        create: {
          dispatchDate,
          locale: legacyDispatch.challenge.locale,
          subjectSlug: legacyDispatch.challenge.subjectSlug,
          challengeId: legacyDispatch.challenge.id,
        },
        update: {},
        include: { challenge: true },
      });
    return claimed.challenge;
  }

  const challenge =
    await getNextDailyPublicChallengeLink(locale);
  if (!challenge || challenge.locale !== locale) {
    return null;
  }

  const claimed =
    await prisma.publicChallengeDailyDispatch.upsert({
      where: { dispatchDate },
      create: {
        dispatchDate,
        locale,
        subjectSlug: challenge.subjectSlug,
        challengeId: challenge.id,
      },
      update: {},
      include: { challenge: true },
    });

  return claimed.challenge;
}

type DailyEmailPublishResult = {
  status: "sent" | "failed" | "skipped";
  campaignId: number | null;
  selectedCount: number | null;
  error: string | null;
};

export async function publishDailyChallengeEmail(args: {
  challenge: NonNullable<
    Awaited<ReturnType<typeof getActivePracticeChallengeLink>>
  >;
  dispatchDate: string;
  sourceListId: number;
  now?: Date;
}): Promise<DailyEmailPublishResult> {
  const now = args.now ?? new Date();
  const idempotencyKey =
    `daily:${args.dispatchDate}:email:${args.sourceListId}`;

  const existing =
    await prisma.publicChallengeEmailDispatch.upsert({
      where: { idempotencyKey },
      create: {
        challengeId: args.challenge.id,
        dispatchDate: args.dispatchDate,
        sourceListId: args.sourceListId,
        status: "pending",
        idempotencyKey,
      },
      update: {},
    });

  if (existing.status === "sent") {
    return {
      status: "skipped",
      campaignId: existing.campaignId,
      selectedCount: existing.selectedCount,
      error: null,
    };
  }

  if (existing.status === "sending") {
    return {
      status: "skipped",
      campaignId: existing.campaignId,
      selectedCount: existing.selectedCount,
      error: "Email dispatch is already in progress.",
    };
  }

  const claim =
    await prisma.publicChallengeEmailDispatch.updateMany({
      where: {
        id: existing.id,
        status: { in: ["pending", "failed"] },
      },
      data: {
        status: "sending",
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });

  if (claim.count !== 1) {
    return {
      status: "skipped",
      campaignId: existing.campaignId,
      selectedCount: existing.selectedCount,
      error: "Email dispatch was claimed by another worker.",
    };
  }

  try {
    const challengeWithImage =
      await ensurePublicChallengeSocialImage(args.challenge);
    const description =
      await resolvePublicChallengeSocialDescription(
        challengeWithImage,
      );
    const presentation = buildPublicChallengePresentation({
      source: challengeWithImage,
      fallbackTitle: challengeWithImage.exerciseKey,
    });
    const result = await sendPublicChallengeCampaignNow({
      sourceListId: args.sourceListId,
      excludedEmails: [],
      challengeUrl: `${getProductionAppOrigin("website")}${practiceChallengePath(
        challengeWithImage.code,
      )}`,
      imageUrl: presentation.imageUrl,
      title: presentation.title,
      description,
    });

    await prisma.publicChallengeEmailDispatch.update({
      where: { id: existing.id },
      data: {
        status: "sent",
        campaignId: result.campaignId,
        selectedCount: result.selectedCount,
        sentAt: now,
        lastError: null,
      },
    });

    return {
      status: "sent",
      campaignId: result.campaignId,
      selectedCount: result.selectedCount,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 1_000)
        : "Automatic Brevo challenge email failed.";

    await prisma.publicChallengeEmailDispatch.updateMany({
      where: {
        id: existing.id,
        status: "sending",
      },
      data: {
        status: "failed",
        lastError: message,
      },
    });

    return {
      status: "failed",
      campaignId: null,
      selectedCount: null,
      error: message,
    };
  }
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

  if (
    !settings.providers.length &&
    !settings.emailEnabled
  ) {
    return {
      ok: true as const,
      action: "no_channels" as const,
    };
  }

  const clock = localClock(now, settings.timezone);
  const challenge =
    await getDailyPublicChallengeForDispatch(
      settings.locale,
      clock.date,
    );

  if (!challenge) {
    return {
      ok: true as const,
      action: "no_active_challenge" as const,
    };
  }

  const social = settings.providers.length
    ? await publishChallengeToSocial({
        challenge,
        providers: settings.providers,
        source: "daily",
        dispatchDate: clock.date,
        now,
      })
    : {
        ok: true as const,
        challengeCode: challenge.code,
        results: [],
      };

  let email: DailyEmailPublishResult = {
    status: "skipped",
    campaignId: null,
    selectedCount: null,
    error: null,
  };

  if (settings.emailEnabled) {
    if (!settings.emailListId) {
      email = {
        status: "failed",
        campaignId: null,
        selectedCount: null,
        error:
          "Automatic Brevo email is enabled without an audience list.",
      };
    } else {
      const currentChallenge =
        settings.providers.length
          ? await prisma.practiceChallengeLink.findUniqueOrThrow({
              where: { id: challenge.id },
            })
          : challenge;

      email = await publishDailyChallengeEmail({
        challenge: currentChallenge,
        dispatchDate: clock.date,
        sourceListId: settings.emailListId,
        now,
      });
    }
  }

  return {
    action: "processed" as const,
    ...social,
    email,
  };
}

export async function getPublicChallengeSocialAdminState(): Promise<PublicChallengeSocialAdminResponse> {
  const [automation, recentPosts, email] = await Promise.all([
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
    listPublicChallengeAudienceLists().catch(() => ({
      provider: "brevo" as const,
      configured: false as const,
      defaultListId: null,
      lists: [],
    })),
  ]);

  return {
    schedulerConfigured: publicChallengeSocialSchedulerConfigured(),
    providers: publicChallengeSocialProviderStatuses(),
    automation,
    email,
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
