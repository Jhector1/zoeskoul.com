import { describe, expect, it } from "vitest";

import { buildPracticeUrlSyncSearch } from "./storage";

describe("Practice URL session ownership", () => {
  it("adds the authoritative session id without rewriting locked-run filters", () => {
    const currentSearch = new URLSearchParams({
      section: "section-a",
      topic: "all",
      difficulty: "easy",
      questionCount: "2",
      preferPurpose: "practice",
      purposePolicy: "strict",
    }).toString();

    const next = new URLSearchParams(
      buildPracticeUrlSyncSearch({
        currentSearch,
        sessionId: "independent-session",
        isLockedRun: true,
        section: "different-section",
        topic: "different-topic",
        difficulty: "hard",
        preferPurpose: "quiz",
        purposePolicy: "fallback",
        sessionSize: 10,
      }),
    );

    expect(next.get("sessionId")).toBe("independent-session");
    expect(next.get("section")).toBe("section-a");
    expect(next.get("topic")).toBe("all");
    expect(next.get("difficulty")).toBe("easy");
    expect(next.get("questionCount")).toBe("2");
    expect(next.get("preferPurpose")).toBe("practice");
    expect(next.get("purposePolicy")).toBe("strict");
  });
});
