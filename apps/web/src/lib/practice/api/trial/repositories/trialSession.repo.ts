import type { Prisma, PrismaClient } from "@/lib/prisma";
import { readSharedChallengeMeta } from "@/lib/practice/challenges/session";

type TrialSessionMode = "onboarding_trial" | "public_challenge";

async function findTrialSessionByStatus(args: {
  prisma: PrismaClient;
  ownerWhere: Prisma.PracticeSessionWhereInput;
  sectionId: string;
  status: "active" | "completed";
  mode: TrialSessionMode;
  challengeId?: string | null;
  experienceKey?: string | null;
}) {
  const rows = await args.prisma.practiceSession.findMany({
    where: {
      ...args.ownerWhere,
      status: args.status,
      mode: args.mode,
      sectionId: args.sectionId,
      ...(args.experienceKey ? { experienceKey: args.experienceKey } : {}),
    },
    orderBy:
      args.status === "completed"
        ? [{ completedAt: "desc" }, { startedAt: "desc" }]
        : [{ startedAt: "desc" }],
    select: { id: true, meta: true },
  });

  return (
    rows.find((row) => {
      if (args.mode === "onboarding_trial") return true;
      const challenge = readSharedChallengeMeta(row.meta);
      return Boolean(args.challengeId && challenge?.challengeId === args.challengeId);
    }) ?? null
  );
}

export async function findActiveTrialSession(args: {
  prisma: PrismaClient;
  ownerWhere: Prisma.PracticeSessionWhereInput;
  sectionId: string;
  mode: TrialSessionMode;
  challengeId?: string | null;
  experienceKey?: string | null;
}) {
  return findTrialSessionByStatus({ ...args, status: "active" });
}

export async function findCompletedTrialSession(args: {
  prisma: PrismaClient;
  ownerWhere: Prisma.PracticeSessionWhereInput;
  sectionId: string;
  mode: TrialSessionMode;
  challengeId?: string | null;
  experienceKey?: string | null;
}) {
  return findTrialSessionByStatus({ ...args, status: "completed" });
}

export async function updateTrialSession(args: {
  prisma: PrismaClient;
  sessionId: string;
  experienceKey?: string | null;
  mode: TrialSessionMode;
  difficulty: "easy" | "medium" | "hard";
  returnUrl: string;
  meta: Prisma.InputJsonValue;
  helpPolicy?: Prisma.InputJsonValue;
  targetCount?: number;
  preferPurpose?: "quiz" | "project";
}) {
  return args.prisma.practiceSession.update({
    where: { id: args.sessionId },
    data: {
      mode: args.mode,
      ...(args.experienceKey ? { experienceKey: args.experienceKey } : {}),
      difficulty: args.difficulty,
      returnUrl: args.returnUrl,
      meta: args.meta,
      ...(args.helpPolicy ? { helpPolicy: args.helpPolicy } : {}),
      ...(args.preferPurpose ? { preferPurpose: args.preferPurpose } : {}),
      ...(typeof args.targetCount === "number"
        ? { targetCount: args.targetCount }
        : {}),
    },
    select: { id: true },
  });
}

export async function createTrialSession(args: {
  prisma: PrismaClient;
  mode: TrialSessionMode;
  experienceKey: string;
  userId: string | null;
  guestId: string | null;
  sectionId: string;
  moduleId: string | null;
  difficulty: "easy" | "medium" | "hard";
  returnUrl: string;
  meta: Prisma.InputJsonValue;
  helpPolicy?: Prisma.InputJsonValue;
  targetCount?: number;
  preferPurpose?: "quiz" | "project";
}) {
  return args.prisma.practiceSession.create({
    data: {
      userId: args.userId,
      guestId: args.userId ? null : args.guestId,
      status: "active",
      mode: args.mode,
      experienceKey: args.experienceKey,
      preferPurpose: args.preferPurpose ?? "quiz",
      sectionId: args.sectionId,
      moduleId: args.moduleId,
      difficulty: args.difficulty,
      targetCount: args.targetCount ?? 3,
      returnUrl: args.returnUrl,
      meta: args.meta,
      helpPolicy: args.helpPolicy ?? {
        stepKeys: ["concept", "hint_1", "hint_2", "reveal"],
      },
    },
    select: { id: true },
  });
}
