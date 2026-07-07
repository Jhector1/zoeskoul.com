import { describe, expect, it } from "vitest";
import type { QItem } from "@/lib/practice/uiTypes";
import {
  isStandaloneAnswerResolved,
  supportsStandaloneAutoAdvance,
} from "./standaloneAutoAdvance";

function item(overrides: Partial<QItem> = {}): QItem {
  return {
    key: "exercise-1",
    exercise: null as any,
    single: "",
    multi: [],
    num: "",
    dragA: { x: 0, y: 0, z: 0 },
    dragB: { x: 0, y: 0, z: 0 },
    matRows: 0,
    matCols: 0,
    mat: [],
    result: null,
    submitted: false,
    attempts: 0,
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
    ...overrides,
  } as QItem;
}

describe("standalone Review-style auto advance", () => {
  it.each(["practice", "standard", "daily_five", "assignment"] as const)(
    "enables auto advance for %s",
    (mode) => {
      expect(supportsStandaloneAutoAdvance(mode)).toBe(true);
    },
  );

  it.each(["public_challenge", "onboarding_trial"] as const)(
    "keeps %s manual",
    (mode) => {
      expect(supportsStandaloneAutoAdvance(mode)).toBe(false);
    },
  );

  it("advances after a correct answer", () => {
    expect(
      isStandaloneAnswerResolved({
        current: item({ result: { ok: true } as any, attempts: 1 }),
        maxAttempts: 3,
      }),
    ).toBe(true);
  });

  it("advances after the final limited attempt", () => {
    expect(
      isStandaloneAnswerResolved({
        current: item({ result: { ok: false } as any, attempts: 3 }),
        maxAttempts: 3,
      }),
    ).toBe(true);
  });

  it("does not auto advance after reveal", () => {
    expect(
      isStandaloneAnswerResolved({
        current: item({
          revealed: true,
          result: { ok: false, revealUsed: true } as any,
          attempts: 3,
        }),
        maxAttempts: 3,
      }),
    ).toBe(false);
  });

  it("stays on an incorrect answer while attempts remain", () => {
    expect(
      isStandaloneAnswerResolved({
        current: item({ result: { ok: false } as any, attempts: 1 }),
        maxAttempts: 3,
      }),
    ).toBe(false);
  });
});
