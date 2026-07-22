import { describe, expect, it } from "vitest";

import { buildSubscriberPracticeHref } from "./subscriberPracticeHref";

describe("buildSubscriberPracticeHref", () => {
  it("carries the scope-sized question count into subscriber practice", () => {
    const href = buildSubscriberPracticeHref({
      selection: {
        catalogSlug: "python",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
        sectionSlug: "functions",
        topicSlug: "return-values",
      },
      targetCount: 4,
    });

    const url = new URL(href, "https://zoeskoul.test");
    expect(url.pathname).toBe(
      "/subjects/python-v2/modules/python-v2-1/practice",
    );
    expect(url.searchParams.get("section")).toBe("functions");
    expect(url.searchParams.get("topic")).toBe("return-values");
    expect(url.searchParams.get("questionCount")).toBe("4");
  });

  it("builds the canonical localized URL for an existing subscriber session", () => {
    const href = buildSubscriberPracticeHref({
      locale: "en",
      selection: {
        catalogSlug: "linux",
        subjectSlug: "linux-terminal-fundamentals",
        moduleSlug: "terminal-orientation-and-navigation",
        sectionSlug: "terminal-orientation",
        topicSlug: "what-the-terminal-is",
      },
      targetCount: 7,
      sessionId: "practice-session-123",
    });

    const url = new URL(href, "https://zoeskoul.test");
    expect(url.pathname).toBe(
      "/en/subjects/linux-terminal-fundamentals/modules/terminal-orientation-and-navigation/practice",
    );
    expect(url.searchParams.get("section")).toBe("terminal-orientation");
    expect(url.searchParams.get("topic")).toBe("what-the-terminal-is");
    expect(url.searchParams.get("sessionId")).toBe("practice-session-123");
    expect(url.searchParams.get("questionCount")).toBe("7");
  });
});
