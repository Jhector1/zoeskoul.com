import { describe, expect, it } from "vitest";
import { buildTopicRecipePrompt } from "./buildTopicRecipePrompt.js";

describe("buildTopicRecipePrompt", () => {
  it("requires topic recipes to preserve normalized seed slugs", () => {
    const prompt = buildTopicRecipePrompt({
      locale: "en",
      seed: {
        subjectSlug: "linux-terminal-fundamentals",
        moduleSlug: "linux-module-1-terminal-navigation",
        sectionSlug: "linux-module-1-orientation",
        modulePrefix: "linux_module_1",
        topicId: "what-the-terminal-is",
      } as any,
    });

    expect(prompt.system).toContain("Use seed.moduleSlug exactly");
    expect(prompt.system).toContain("Use seed.sectionSlug exactly");
    expect(prompt.system).toContain("Use seed.modulePrefix as topicBundle.prefix exactly");
    expect(prompt.system).toContain("Do not reintroduce shorthand slugs");
  });
});
