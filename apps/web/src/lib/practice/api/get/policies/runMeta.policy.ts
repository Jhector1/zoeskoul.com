import type { Difficulty } from "@/lib/practice/types";
import type { PracticeRunMetaApi } from "@/lib/practice/apiTypes";
import type { PrismaClient } from "@/lib/prisma";
import { computeMaxAttempts } from "../../shared/attempts";
import { resolvePracticeRunMode } from "../../shared/run";
import {
  getSessionMaxAttempts,
  readSharedChallengeMeta,
} from "@/lib/practice/challenges/session";
import { readDailyFiveMeta } from "@/lib/practice/experience/dailyFive";
import { readSubscriberPracticeMeta } from "@/lib/practice/experience/subscriberPractice";
import { loadCanonicalModulePracticeDisplay } from "@/lib/practice/experience/subscriberPracticeSessions.server";
import { getPracticeExperiencePolicy } from "@/lib/practice/experience/policy";
import { resolvePracticeViewer } from "@/lib/practice/experience/viewer";
import type { PracticeRunViewer } from "@/lib/practice/experience/types";
import { normalizePracticeHelpPolicy } from "@/lib/practice/help/steps";
import { nextUtcDayStartIso } from "@/lib/practice/experience/completion";

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
}): PracticeRunMetaApi {
  const { session, diff, allowRevealEffective } = args;
  const viewer = args.viewer ?? GUEST_VIEWER;

  const mode = resolvePracticeRunMode(session);
  const challenge = readSharedChallengeMeta(session?.meta ?? null);
  const daily = readDailyFiveMeta(session?.meta ?? null);
  const subscriberPractice = readSubscriberPracticeMeta(session?.meta ?? null);

  const basePolicy = getPracticeExperiencePolicy({
    mode,
    viewerTier: viewer.tier,
    difficulty: diff,
    topic: "all",
    targetCount: session?.targetCount ?? null,
    assignmentAllowReveal: Boolean(session?.assignment?.allowReveal),
    assignmentQuestionMaxAttempts: session?.assignment?.maxQuestionAttempts ?? null,
  });
  const policy = subscriberPractice
    ? {
        ...basePolicy,
        targetCount: subscriberPractice.targetCount,
        lockDifficulty: diff,
        lockTopic: subscriberPractice.scope?.topicSlug ?? "all",
        filters: {
          topicEditable: false,
          difficultyEditable: false,
          purposeEditable: false,
          countEditable: false,
        },
        eligibility: {
          ...basePolicy.eligibility,
          allowedPurposes: Array.from(
            new Set(
              subscriberPractice.queue.map(
                (target) => target.exercisePurpose,
              ),
            ),
          ),
        },
      }
    : basePolicy;

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
    daily: daily
      ? {
          dayKey: daily.dayKey,
          nextResetAt:
            nextUtcDayStartIso(daily.dayKey) ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          targetCount: daily.targetCount,
        }
      : null,
    subscriberPractice: subscriberPractice
      ? {
          moduleTotal: subscriberPractice.moduleTotal,
          completedPrefix: subscriberPractice.completedPrefix.map((target) => ({
            exerciseKey: target.exerciseKey,
            exerciseTitle: target.exerciseTitle,
            exerciseKind: target.exerciseKind,
            topicSlug: target.topicSlug,
            sectionSlug: target.sectionSlug,
          })),
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
  let run = buildRunMeta({
    session: args.session,
    diff: args.diff,
    allowRevealEffective: args.allowRevealEffective,
    viewer,
  });

  const daily = readDailyFiveMeta(args.session?.meta ?? null);
  const firstDailyTarget = daily?.queue[0] ?? null;
  const singleModuleDaily = Boolean(
    firstDailyTarget &&
      daily?.queue.every(
        (target) =>
          target.subjectSlug === firstDailyTarget.subjectSlug &&
          target.moduleSlug === firstDailyTarget.moduleSlug,
      ),
  );

  if (run.daily && daily && actor.userId && firstDailyTarget && singleModuleDaily) {
    const modulePractice = await loadCanonicalModulePracticeDisplay({
      userId: actor.userId,
      subjectSlug: firstDailyTarget.subjectSlug,
      moduleSlug: firstDailyTarget.moduleSlug,
      moduleId:
        typeof args.session?.moduleId === "string"
          ? args.session.moduleId
          : null,
    });

    run = {
      ...run,
      daily: {
        ...run.daily,
        modulePractice: {
          moduleTotal: modulePractice.moduleTotal,
          selectedTargets: modulePractice.selectedTargets.map((target) => ({
            exerciseKey: target.exerciseKey,
            exerciseTitle: target.exerciseTitle,
            exerciseKind: target.exerciseKind,
            topicSlug: target.topicSlug,
            sectionSlug: target.sectionSlug,
          })),
          allowedTargets: daily.queue.map((target) => ({
            exerciseKey: target.exerciseKey,
            exerciseTitle: target.exerciseTitle,
            exerciseKind: target.exerciseKind,
            topicSlug: target.topicSlug,
            sectionSlug: target.sectionSlug,
          })),
          completedPrefix: modulePractice.completedPrefix.map((target) => ({
            exerciseKey: target.exerciseKey,
            exerciseTitle: target.exerciseTitle,
            exerciseKind: target.exerciseKind,
            topicSlug: target.topicSlug,
            sectionSlug: target.sectionSlug,
            correct: target.correct,
          })),
        },
      },
    };
  }

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
