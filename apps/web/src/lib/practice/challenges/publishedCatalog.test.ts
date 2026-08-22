import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listVisiblePracticeChooserExerciseOptions } from "./publishedCatalog";

describe("published Practice catalog canonical topic identity", () => {
  it("emits the canonical namespaced topic slug for authored SQL Practice", async () => {
    const options = await listVisiblePracticeChooserExerciseOptions(
      new Set(["sql-analysis-reporting"]),
    );

    const rows = options.filter(
      (option) =>
        option.subjectSlug === "sql-analysis-reporting" &&
        option.moduleSlug ===
          "sql-analysis-reporting-module-1-null-safe-calculations" &&
        option.sectionSlug ===
          "sql-analysis-reporting-sql-analysis-reporting-section-1-business-calculations" &&
        option.topicSlug ===
          "sql_analysis_reporting_module_1.case-for-readable-labels" &&
        option.exercisePurpose === "practice",
    );

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.exerciseKey).sort()).toEqual([
      "practice-label-rating-availability",
      "practice-order-value-bands",
      "practice-retained-case-for-readable-labels-sketch1",
    ]);
    expect(
      options.some(
        (option) =>
          option.subjectSlug === "sql-analysis-reporting" &&
          option.topicSlug === "case-for-readable-labels",
      ),
    ).toBe(false);
  });
});
