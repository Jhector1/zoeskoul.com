import { describe, expect, it } from "vitest";

import type { QItem } from "@/lib/practice/uiTypes";
import {
  buildAiTutorFailureContext,
  shouldOfferAiTutor,
} from "./tutorContext";

function item(patch: Partial<QItem> = {}): QItem {
  return {
    key: "signed-key",
    exercise: {} as any,
    single: "",
    multi: [],
    num: "",
    dragA: { x: 0, y: 0, z: 0 },
    dragB: { x: 0, y: 0, z: 0 },
    matRows: 0,
    matCols: 0,
    mat: [],
    result: { ok: false, expected: null } as any,
    submitted: false,
    attempts: 2,
    code: "",
    codeLang: "python",
    codeStdin: "",
    text: "",
    voiceTranscript: "",
    help: {
      openedStepKeys: [],
      activeStepKey: null,
      entries: {},
      busyStepKey: null,
      error: null,
    },
    ...patch,
  };
}

describe("AI tutor availability", () => {
  it("appears only after two unsuccessful attempts", () => {
    expect(shouldOfferAiTutor(item({ attempts: 1 }))).toBe(false);
    expect(shouldOfferAiTutor(item({ attempts: 2 }))).toBe(true);
    expect(
      shouldOfferAiTutor(item({ attempts: 2, result: { ok: true } as any })),
    ).toBe(false);
    expect(shouldOfferAiTutor(item({ attempts: 2, revealed: true }))).toBe(false);
  });

  it("collects learner-safe feedback and recent terminal evidence", () => {
    const context = buildAiTutorFailureContext(
      item({
        attempts: 3,
        result: {
          ok: false,
          feedback: {
            title: "Not correct yet",
            message: "The newest commit does not contain the requested file.",
          },
          explanation: "Inspect the latest snapshot.",
        } as any,
        terminalEvidence: {
          commands: ["git status --short", "git commit -m\"Update files\""],
          outputText: "1 file changed",
          cwd: "/workspace/project",
        },
      }),
    );

    expect(context.attemptCount).toBe(3);
    expect(context.feedbackTitle).toBe("Not correct yet");
    expect(context.feedbackMessage).toContain("newest commit");
    expect(context.terminal?.commands).toHaveLength(2);
    expect(context.terminal?.cwd).toBe("/workspace/project");
  });
});
