import {
  describe,
  expect,
  it,
} from "vitest";

import {
  capPartialStudentRun,
  mergeStudentRunReports,
  shouldContinueStudentRun,
} from "./continuationPolicy.js";

function makeReport(
  status: "completed" | "blocked" | "partial",
  overrides: Record<string, unknown> = {},
) {
  return {
    status,
    startUrl: "https://student.test/start",
    endUrl: "https://student.test/end",
    pagesVisited: ["https://student.test/start"],
    exercisesAttempted: 1,
    quizzesAttempted: 2,
    projectStepsAttempted: 1,
    findings: [],
    strongestParts: ["Clear lesson"],
    summary: "Pass summary.",
    stoppedReason:
      status === "partial"
        ? "Scope remains unfinished."
        : null,
    browserEvidence: {
      events: [],
      clickCount: 1,
      checkAnswerClicks: 2,
      runClicks: 3,
      revealClicks: 0,
      practiceNextClicks: 0,
      finishClicks: 0,
      modulesClicks: 0,
    },
    ...overrides,
  } as any;
}

describe("Student Agent continuation policy", () => {
  it("continues partial reports while budget remains", () => {
    expect(
      shouldContinueStudentRun(
        makeReport("partial"),
        0,
        3,
      ),
    ).toBe(true);

    expect(
      shouldContinueStudentRun(
        makeReport("partial"),
        3,
        3,
      ),
    ).toBe(false);
  });

  it("stops completed and blocked reports", () => {
    expect(
      shouldContinueStudentRun(
        makeReport("completed"),
        0,
        3,
      ),
    ).toBe(false);

    expect(
      shouldContinueStudentRun(
        makeReport("blocked"),
        0,
        3,
      ),
    ).toBe(false);
  });

  it("merges counts, pages, and browser evidence", () => {
    const merged =
      mergeStudentRunReports(
        makeReport("partial", {
          pagesVisited: ["a", "b"],
          exercisesAttempted: 2,
          browserEvidence: {
            events: [
              {
                sequence: 1,
                at: "2026-08-13T00:00:00.000Z",
                kind: "observe",
                action: "observe_student_ui",
                urlBefore: "a",
                urlAfter: "b",
                detail: "pass 1",
              },
            ],
            clickCount: 2,
            checkAnswerClicks: 3,
            runClicks: 1,
            revealClicks: 0,
            practiceNextClicks: 0,
            finishClicks: 0,
            modulesClicks: 0,
          },
        }),
        makeReport("completed", {
          endUrl: "final",
          pagesVisited: ["b", "c"],
          exercisesAttempted: 4,
          browserEvidence: {
            events: [
              {
                sequence: 1,
                at: "2026-08-13T00:01:00.000Z",
                kind: "click",
                action: "next",
                urlBefore: "b",
                urlAfter: "c",
                detail: "pass 2",
              },
            ],
            clickCount: 5,
            checkAnswerClicks: 6,
            runClicks: 2,
            revealClicks: 1,
            practiceNextClicks: 1,
            finishClicks: 1,
            modulesClicks: 1,
          },
        }),
      );

    expect(merged.status).toBe("completed");
    expect(merged.startUrl).toBe(
      "https://student.test/start",
    );
    expect(merged.endUrl).toBe("final");
    expect(merged.pagesVisited).toEqual(
      ["a", "b", "c"],
    );
    expect(merged.exercisesAttempted).toBe(6);
    const evidence =
      merged.browserEvidence;

    expect(evidence).toBeDefined();

    if (!evidence) {
      throw new Error(
        "Expected merged browser evidence.",
      );
    }

    expect(evidence.clickCount).toBe(7);
    expect(
      evidence.events.map(
        (event: any) => event.sequence,
      ),
    ).toEqual([1, 2]);
  });

  it("handles a report that has no browserEvidence", () => {
    const previous =
      makeReport("partial");
    delete previous.browserEvidence;

    const merged =
      mergeStudentRunReports(
        previous,
        makeReport("completed"),
      );

    expect(
      merged.browserEvidence,
    ).toBeDefined();
    expect(
      merged.status,
    ).toBe("completed");
  });

  it("explains a continuation cap", () => {
    const report = capPartialStudentRun(
      makeReport("partial"),
      12,
    );

    expect(report.status).toBe("partial");
    expect(report.stoppedReason).toContain(
      "continuation cap of 12",
    );
  });
});
