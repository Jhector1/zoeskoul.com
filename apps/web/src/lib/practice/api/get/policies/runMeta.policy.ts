import type { Difficulty } from "@/lib/practice/types";
import type { PrismaClient } from "@/lib/prisma";
import { computeMaxAttempts } from "../../shared/attempts";
import { resolvePracticeRunMode } from "../../shared/run";
import {
  getSessionMaxAttempts,
  readSharedChallengeMeta,
} from "@/lib/practice/challenges/session";
import { readDailyFiveMeta } from "@/lib/practice/experience/dailyFive";
import { getPracticeExperiencePolicy } from "@/lib/practice/experience/policy";
import { resolvePracticeViewer } from "@/lib/practice/experience/viewer";
import type { PracticeRunViewer } from "@/lib/practice/experience/types";
import { normalizePracticeHelpPolicy } from "@/lib/practice/help/steps";

const GUEST_VIEWER: PracticeRunViewer = {
  tier: "guest",
  authenticated: false,
  subscribed: false,
};

export function buildRunMeta(args: {
  session: any | null;
  diff: Difficulty;
  allowRevealEffective: boolean;
  viewer?: PracticeRunViewer;
}) {
  const { session, diff, allowRevealEffective } = args;
  const viewer = args.viewer ?? GUEST_VIEWER;

  const mode = resolvePracticeRunMode(session);
  const challenge = readSharedChallengeMeta(session?.meta ?? null);
  const daily = readDailyFiveMeta(session?.meta ?? null);

  const policy = getPracticeExperiencePolicy({
    mode,
    viewerTier: viewer.tier,
    difficulty: diff,
    topic: "all",
    targetCount: session?.targetCount ?? null,
    assignmentAllowReveal: Boolean(session?.assignment?.allowReveal),
    assignmentQuestionMaxAttempts: session?.assignment?.maxQuestionAttempts ?? null,
  });

  const maxAttempts = computeMaxAttempts({
    mode,
    assignmentQuestionMaxAttempts: session?.assignment?.maxQuestionAttempts ?? null,
    sessionMaxAttempts:
      getSessionMaxAttempts(session?.meta ?? null) ?? daily?.maxAttempts ?? null,
  });

  const returnUrl = typeof session?.returnUrl === "string" ? session.returnUrl : null;
  const help = normalizePracticeHelpPolicy(
    session?.helpPolicy ?? null,
    policy.allowReveal && allowRevealEffective,
  );

  return {
    mode,
    label: policy.label,
    lockDifficulty: policy.lockDifficulty,
    lockTopic: policy.lockTopic,
    filters: policy.filters,
    allowReveal: policy.allowReveal && allowRevealEffective,
    showDebug: mode === "assignment" && Boolean(session?.assignment?.showDebug),
    targetCount: policy.targetCount ?? session?.targetCount ?? 10,
    maxAttempts,
    returnUrl,
    viewer,
    help,
    challenge: challenge
      ? {
          exerciseKey: challenge.exerciseKey,
          title: challenge.exerciseTitle,
          maxAttempts: challenge.maxAttempts,
        }
      : null,
  };
}

export async function buildRunMetaWithChallengeAttempts(args: {
  prisma: PrismaClient;
  actor: { userId?: string | null; guestId?: string | null };
  session: any | null;
  diff: Difficulty;
  allowRevealEffective: boolean;
}) {
  const actor = {
    userId: args.actor.userId ?? null,
    guestId: args.actor.guestId ?? null,
  };
  const viewer = await resolvePracticeViewer(args.prisma, actor);
  const run = buildRunMeta({
    session: args.session,
    diff: args.diff,
    allowRevealEffective: args.allowRevealEffective,
    viewer,
  });
  if (!run.challenge || !args.session?.id) return run;

  const OR = [
    actor.userId ? { userId: actor.userId } : null,
    actor.guestId ? { guestId: actor.guestId } : null,
  ].filter(Boolean) as Array<{ userId: string } | { guestId: string }>;

  const attemptsUsed = await args.prisma.practiceAttempt.count({
    where: {
      sessionId: args.session.id,
      revealUsed: false,
      ...(OR.length ? { OR } : {}),
    },
  });

  return {
    ...run,
    challenge: {
      ...run.challenge,
      attemptsUsed,
    },
  };
}
