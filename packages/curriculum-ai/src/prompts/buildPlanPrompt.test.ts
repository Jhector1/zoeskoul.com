import { describe, expect, it } from "vitest";
import {
  buildPlanPrompt,
  COURSE_STRUCTURE_NAMING_RULES,
  FINAL_CAPSTONE_STRUCTURE_RULES,
} from "./buildPlanPrompt.js";

describe("buildPlanPrompt", () => {
  it("includes normalized slug rules for all future generated courses", () => {
    const prompt = buildPlanPrompt({
      subjectSlug: "linux",
      profileId: "bash",
      title: "Linux Terminal Fundamentals",
      description: "Learn the terminal.",
    } as any);

    const user = JSON.parse(prompt.user);
    const rules = user.rules.join("\n");

    expect(COURSE_STRUCTURE_NAMING_RULES.length).toBeGreaterThan(0);
    expect(rules).toContain("moduleSlug format: <subjectSlug>-module-<number>-<short-topic-area>");
    expect(rules).toContain("sectionSlug format: <subjectSlug>-module-<number>-<short-section-role>");
    expect(rules).toContain("prefix format: <subject_slug_with_underscores>_module_<number>");
    expect(rules).toContain("Do not use shorthand prefixes such as lin1");
    expect(rules).toContain("avoid linux-terminal-fundamentals-linux-1-orientation");
  });

  it("requires one final capstone with an authoring-defined step count", () => {
    const prompt = buildPlanPrompt({
      subjectSlug: "sql",
      profileId: "sql",
      title: "Multi-Table SQL",
      description: "Learn joins.",
    } as any);

    const user = JSON.parse(prompt.user);
    const rules = user.rules.join("\n");

    expect(FINAL_CAPSTONE_STRUCTURE_RULES.length).toBeGreaterThan(0);
    expect(rules).toContain("exactly one module whose role is capstone");
    expect(rules).toContain("exactly one section whose role is capstone");
    expect(rules).toContain("Set projectBrief to null on every non-capstone topic");
    expect(rules).toContain("projectBrief.stepCountTarget");
    expect(rules).toContain("exactly stepCountTarget ordered steps");
  });
});
