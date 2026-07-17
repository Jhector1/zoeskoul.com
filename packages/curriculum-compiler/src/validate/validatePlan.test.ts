import { describe, expect, it } from "vitest";
import { validatePlan } from "./validatePlan.js";

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    subjectSlug: "sql",
    profileId: "sql",
    modules: [
      {
        moduleSlug: "multi-table-sql-module-0-foundations",
        prefix: "multi_table_sql_module_0",
        order: 1,
        title: "Foundations",
        sections: [
          {
            sectionSlug: "multi-table-sql-section-0-lessons",
            order: 1,
            title: "Lessons",
            topics: [
              {
                topicId: "joins",
                order: 1,
                title: "Joins",
                summary: "Learn joins.",
                minutes: 20,
                learningGoals: [],
              },
            ],
          },
        ],
      },
      {
        moduleSlug: "multi-table-sql-module-1-final-capstone",
        prefix: "multi_table_sql_module_1",
        order: 2,
        role: "capstone",
        title: "Final Capstone",
        sections: [
          {
            sectionSlug: "multi-table-sql-section-1-final-capstone",
            order: 1,
            role: "capstone",
            title: "Final Capstone",
            topics: [
              {
                topicId: "final-report",
                order: 1,
                title: "Final Report",
                summary: "Build the final report.",
                minutes: 90,
                learningGoals: [],
                projectBrief: {
                  stepCountTarget: 4,
                  flow: "progressive",
                  stepLadder: [
                    { step: 1, title: "Start", requirement: "Build the base." },
                    { step: 2, title: "Extend", requirement: "Add counts." },
                    { step: 3, title: "Validate", requirement: "Check grain." },
                    { step: 4, title: "Deliver", requirement: "Finish." },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  } as any;
}

describe("validatePlan", () => {
  it("accepts one final capstone with an authoring-defined step count", () => {
    expect(() => validatePlan(makePlan())).not.toThrow();
  });

  it("rejects extra sections in the final capstone module", () => {
    const plan = makePlan();
    plan.modules[1].sections.unshift({
      sectionSlug: "multi-table-sql-section-1-planning",
      order: 1,
      title: "Planning",
      topics: [],
    });

    expect(() => validatePlan(plan)).toThrow(
      "The final capstone module must contain exactly one capstone section",
    );
  });

  it("rejects a step ladder that does not match the authored target", () => {
    const plan = makePlan();
    plan.modules[1].sections[0].topics[0].projectBrief.stepLadder.pop();

    expect(() => validatePlan(plan)).toThrow(
      "projectBrief.stepLadder must contain exactly 4 step(s)",
    );
  });

  it("allows an explicit final-capstone opt-out", () => {
    const plan = makePlan({ modules: [makePlan().modules[0]] });
    expect(() =>
      validatePlan(plan, { requireFinalCapstone: false }),
    ).not.toThrow();
  });
});
