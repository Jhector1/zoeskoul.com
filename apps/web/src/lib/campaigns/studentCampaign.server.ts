import "server-only";

import { prisma } from "@/lib/prisma";
import { grantTutoringMinutes } from "@/lib/tutoring/tutoringCommercial";
import {
  isStudentCampaignAudience,
  isStudentCampaignDisplayFrequency,
  studentCampaignAudienceMatches,
  studentCampaignShouldDisplay,
  type StudentCampaignProjection,
} from "./studentCampaign";

export async function ensureStudentCampaignTutoringGrants(
  userId: string,
  now = new Date(),
  subscriber = false,
): Promise<number> {
  const campaigns = await prisma.studentCampaign.findMany({
    where: {
      enabled: true,
      status: "published",
      startsAt: { lte: now },
      endsAt: { gt: now },
      tutoringGrantMinutes: { not: null },
    },
    orderBy: [{ priority: "asc" }, { startsAt: "asc" }],
    select: {
      id: true,
      audience: true,
      tutoringGrantMinutes: true,
    },
  });

  let granted = 0;

  for (const campaign of campaigns) {
    const minutes = campaign.tutoringGrantMinutes;
    if (!minutes || !Number.isSafeInteger(minutes) || minutes <= 0) {
      continue;
    }

    if (
      !isStudentCampaignAudience(campaign.audience) ||
      !studentCampaignAudienceMatches(
        campaign.audience,
        subscriber,
      )
    ) {
      continue;
    }

    await grantTutoringMinutes({
      userId,
      minutes,
      kind: "admin_grant",
      idempotencyKey:
        `tutoring:student-campaign:${campaign.id}:user:${userId}:grant`,
      meta: {
        source: "student_campaign",
        campaignId: campaign.id,
        promotional: true,
        refundable: false,
      },
    });

    granted += 1;
  }

  return granted;
}

export async function listEligibleStudentCampaigns(args: {
  userId: string;
  subscriber: boolean;
  now?: Date;
}): Promise<StudentCampaignProjection[]> {
  const now = args.now ?? new Date();

  await ensureStudentCampaignTutoringGrants(
    args.userId,
    now,
    args.subscriber,
  );

  const rows = await prisma.studentCampaign.findMany({
    where: {
      enabled: true,
      status: "published",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    orderBy: [{ priority: "asc" }, { startsAt: "asc" }],
    select: {
      id: true,
      title: true,
      body: true,
      ctaLabel: true,
      ctaHref: true,
      audience: true,
      displayFrequency: true,
      startsAt: true,
      endsAt: true,
      tutoringGrantMinutes: true,
      deliveries: {
        where: { userId: args.userId },
        take: 1,
        select: {
          lastShownAt: true,
          dontShowAgainAt: true,
        },
      },
    },
  });

  return rows.flatMap((row) => {
    if (
      !isStudentCampaignAudience(row.audience) ||
      !isStudentCampaignDisplayFrequency(row.displayFrequency)
    ) {
      return [];
    }

    if (
      !studentCampaignAudienceMatches(
        row.audience,
        args.subscriber,
      )
    ) {
      return [];
    }

    if (
      !studentCampaignShouldDisplay(
        row.displayFrequency,
        row.deliveries[0]?.lastShownAt ?? null,
        row.deliveries[0]?.dontShowAgainAt ?? null,
        now,
      )
    ) {
      return [];
    }

    return [{
      id: row.id,
      title: row.title,
      body: row.body,
      ctaLabel: row.ctaLabel,
      ctaHref: row.ctaHref,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      displayFrequency: row.displayFrequency,
      tutoringGrantMinutes: row.tutoringGrantMinutes,
    }];
  });
}

export async function recordStudentCampaignEvent(args: {
  campaignId: string;
  userId: string;
  event: "impression" | "dismiss" | "dont_show_again";
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();

  const active = await prisma.studentCampaign.findFirst({
    where: {
      id: args.campaignId,
      enabled: true,
      status: "published",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    select: { id: true },
  });

  if (!active) {
    throw new Error("Student campaign is not active.");
  }

  if (args.event === "impression") {
    await prisma.studentCampaignDelivery.upsert({
      where: {
        campaignId_userId: {
          campaignId: args.campaignId,
          userId: args.userId,
        },
      },
      create: {
        campaignId: args.campaignId,
        userId: args.userId,
        impressionCount: 1,
        firstShownAt: now,
        lastShownAt: now,
      },
      update: {
        impressionCount: { increment: 1 },
        lastShownAt: now,
      },
    });
    return;
  }

  if (args.event === "dismiss") {
    await prisma.studentCampaignDelivery.upsert({
      where: {
        campaignId_userId: {
          campaignId: args.campaignId,
          userId: args.userId,
        },
      },
      create: {
        campaignId: args.campaignId,
        userId: args.userId,
        dismissedAt: now,
      },
      update: {
        dismissedAt: now,
      },
    });
    return;
  }

  await prisma.studentCampaignDelivery.upsert({
    where: {
      campaignId_userId: {
        campaignId: args.campaignId,
        userId: args.userId,
      },
    },
    create: {
      campaignId: args.campaignId,
      userId: args.userId,
      dismissedAt: now,
      dontShowAgainAt: now,
    },
    update: {
      dismissedAt: now,
      dontShowAgainAt: now,
    },
  });
}
