type ServerProgressSnapshot = {
  answeredCount?: number | null;
  totalCount?: number | null;
  correctCount?: number | null;
};

type SubscriberPracticeProgress = {
  completedPrefix?: Array<{
    correct?: boolean;
  }> | null;
} | null;

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/**
 * Normal self-paced Practice can finish entirely from canonical learner
 * history while this browser run has no local submitted rows. The summary
 * must therefore merge local work with the authoritative server snapshot and
 * canonical completedPrefix rather than treating the local stack as progress
 * ownership.
 */
export function resolvePracticeProgressCounts(args: {
  localAnswered: number;
  localCorrect: number;
  serverStatus?: ServerProgressSnapshot | null;
  subscriberPractice?: SubscriberPracticeProgress;
}) {
  const canonicalPrefix = Array.isArray(
    args.subscriberPractice?.completedPrefix,
  )
    ? args.subscriberPractice.completedPrefix
    : [];

  const canonicalAnswered = canonicalPrefix.length;
  const canonicalCorrect = canonicalPrefix.filter(
    (target) => target.correct === true,
  ).length;

  const serverAnswered = Math.max(
    count(args.serverStatus?.totalCount),
    count(args.serverStatus?.answeredCount),
  );
  const serverCorrect = count(args.serverStatus?.correctCount);

  return {
    answeredCount: Math.max(
      count(args.localAnswered),
      serverAnswered,
      canonicalAnswered,
    ),
    correctCount: Math.max(
      count(args.localCorrect),
      serverCorrect,
      canonicalCorrect,
    ),
  };
}
