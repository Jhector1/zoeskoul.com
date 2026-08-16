import {
  describe,
  expect,
  it,
} from "vitest";

import {
  LearnerActionLog,
} from "./actionLog.js";

describe("LearnerActionLog", () => {
  it("derives semantic counts from real browser actions", () => {
    const log = new LearnerActionLog();

    for (const action of [
      "run",
      "check_answer",
      "check_answer",
      "reveal",
      "practice_next",
    ]) {
      log.record({
        kind: "semantic",
        action,
        urlBefore: "http://localhost:3002/en/x",
        urlAfter: "http://localhost:3002/en/x",
        detail: null,
      });
    }

    expect(log.snapshot()).toMatchObject({
      runClicks: 1,
      checkAnswerClicks: 2,
      revealClicks: 1,
      practiceNextClicks: 1,
    });
  });
});
