import { describe, expect, it } from "vitest";
import { buildPlanRepairPrompt } from "./buildPlanRepairPrompt.js";

describe("buildPlanRepairPrompt", () => {
  it("keeps normalized slug rules during plan repair", () => {
    const prompt = buildPlanRepairPrompt({
      plan: {
        subjectSlug: "linux",
        profileId: "bash",
        modules: [],
      } as any,
      errors: ["bad slug"],
    });

    const user = JSON.parse(prompt.user);
    const rules = user.rules.join("\n");

    expect(rules).toContain("moduleSlug format: <subjectSlug>-module-<number>-<short-topic-area>");
    expect(rules).toContain("Do not use shorthand prefixes such as lin1");
    expect(rules).toContain("Do not duplicate the course slug");
  });
});
