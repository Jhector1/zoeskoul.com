import type {
  StudentRunReport,
} from "./report.js";

export const DEFAULT_MAX_CONTINUATION_PASSES = 12;

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function findingKey(
  finding: StudentRunReport["findings"][number],
) {
  return JSON.stringify([
    finding.severity,
    finding.category,
    finding.url,
    finding.lessonOrExercise,
    finding.problem,
    finding.evidence,
  ]);
}

export function shouldContinueStudentRun(
  report: Pick<StudentRunReport, "status">,
  continuationPass: number,
  maxContinuationPasses =
    DEFAULT_MAX_CONTINUATION_PASSES,
) {
  return (
    report.status === "partial" &&
    continuationPass < maxContinuationPasses
  );
}

export function mergeStudentRunReports(
  previous: StudentRunReport | null,
  next: StudentRunReport,
): StudentRunReport {
  if (!previous) return next;

  const findings = new Map<
    string,
    StudentRunReport["findings"][number]
  >();

  for (const finding of [
    ...previous.findings,
    ...next.findings,
  ]) {
    findings.set(findingKey(finding), finding);
  }

  const previousEvidence =
    previous.browserEvidence;
  const nextEvidence =
    next.browserEvidence;

  const mergedEvidence =
    previousEvidence &&
    nextEvidence
      ? {
          ...nextEvidence,
          clickCount:
            previousEvidence.clickCount +
            nextEvidence.clickCount,
          checkAnswerClicks:
            previousEvidence.checkAnswerClicks +
            nextEvidence.checkAnswerClicks,
          runClicks:
            previousEvidence.runClicks +
            nextEvidence.runClicks,
          revealClicks:
            previousEvidence.revealClicks +
            nextEvidence.revealClicks,
          practiceNextClicks:
            previousEvidence.practiceNextClicks +
            nextEvidence.practiceNextClicks,
          finishClicks:
            previousEvidence.finishClicks +
            nextEvidence.finishClicks,
          modulesClicks:
            previousEvidence.modulesClicks +
            nextEvidence.modulesClicks,
          events: [
            ...previousEvidence.events,
            ...nextEvidence.events,
          ].map((event, index) => ({
            ...event,
            sequence: index + 1,
          })),
        }
      : nextEvidence ??
        previousEvidence;

  return {
    ...next,
    startUrl: previous.startUrl,
    pagesVisited: uniqueStrings([
      ...previous.pagesVisited,
      ...next.pagesVisited,
    ]),
    exercisesAttempted:
      previous.exercisesAttempted +
      next.exercisesAttempted,
    quizzesAttempted:
      previous.quizzesAttempted +
      next.quizzesAttempted,
    projectStepsAttempted:
      previous.projectStepsAttempted +
      next.projectStepsAttempted,
    findings: Array.from(findings.values()),
    strongestParts: uniqueStrings([
      ...previous.strongestParts,
      ...next.strongestParts,
    ]),
    summary: uniqueStrings([
      previous.summary,
      next.summary,
    ]).join(" "),
    ...(mergedEvidence
      ? {
          browserEvidence:
            mergedEvidence,
        }
      : {}),
  };
}

export function capPartialStudentRun(
  report: StudentRunReport,
  maxContinuationPasses: number,
): StudentRunReport {
  if (report.status !== "partial") {
    return report;
  }

  return {
    ...report,
    stoppedReason: [
      report.stoppedReason,
      `Student Agent harness reached its continuation cap of ${maxContinuationPasses} follow-up passes while the requested scope was still incomplete.`,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
