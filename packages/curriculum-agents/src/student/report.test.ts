import { describe, expect, it } from "vitest";

import {
  StudentRunReportSchema,
} from "./report.js";

describe("StudentRunReportSchema", () => {
  it("accepts a learner-grounded report", () => {
    const parsed = StudentRunReportSchema.parse({
      status: "partial",
      startUrl: "http://localhost:3002/en/start",
      endUrl: "http://localhost:3002/en/lesson",
      pagesVisited: [
        "http://localhost:3002/en/start",
        "http://localhost:3002/en/lesson",
      ],
      exercisesAttempted: 1,
      quizzesAttempted: 0,
      projectStepsAttempted: 0,
      findings: [
        {
          severity: "major",
          category: "unclear_instruction",
          url: "http://localhost:3002/en/lesson",
          lessonOrExercise: "First query",
          problem: "The requested output was not clear.",
          evidence: "I could not tell which value should be printed.",
          learnerImpact: "A learner may guess rather than practice the concept.",
          attemptedAction: "I reread the instructions and tried once.",
        },
      ],
      strongestParts: [
        "The example immediately before the exercise was concise.",
      ],
      summary: "The lesson was mostly usable but one prompt blocked progress.",
      stoppedReason: "The exercise could not be completed from learner-visible information.",
    });

    expect(parsed.findings).toHaveLength(1);
  });
});
