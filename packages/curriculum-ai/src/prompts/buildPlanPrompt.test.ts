import { describe, expect, it } from "vitest";
import { buildPlanPrompt, COURSE_STRUCTURE_NAMING_RULES } from "./buildPlanPrompt.js";

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
});
