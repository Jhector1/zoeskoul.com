import { describe, expect, it } from "vitest";

import { shouldShowModulePracticeCta } from "./ModuleSidebar";

describe("Lesson/Review module Practice CTA visibility", () => {
  it("hides the Practice ring when the canonical authored Practice total is zero", () => {
    expect(
      shouldShowModulePracticeCta({
        showPracticeCta: true,
        practiceProgress: { completed: 0, total: 0, pct: 0 },
      }),
    ).toBe(false);
  });

  it("shows the Practice ring when the module has authored Practice exercises", () => {
    expect(
      shouldShowModulePracticeCta({
        showPracticeCta: true,
        practiceProgress: { completed: 0, total: 3, pct: 0 },
      }),
    ).toBe(true);
  });

  it("keeps an explicitly disabled Practice CTA hidden", () => {
    expect(
      shouldShowModulePracticeCta({
        showPracticeCta: false,
        practiceProgress: { completed: 1, total: 3, pct: 1 / 3 },
      }),
    ).toBe(false);
  });

  it("does not show Practice before canonical progress has loaded", () => {
    expect(
      shouldShowModulePracticeCta({
        showPracticeCta: true,
        practiceProgress: null,
      }),
    ).toBe(false);
  });
});
