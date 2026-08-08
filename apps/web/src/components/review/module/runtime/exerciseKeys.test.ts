import { describe, expect, it } from "vitest";
import {
  getCardIdFromToolScopeKey,
  getCardStateKey,
  getCardStateKeyFromToolScopeKey,
  getCardToolScopeKey,
} from "@zoeskoul/learning-runtime/review/module/runtime/exerciseKeys";

describe("card tool scope keys", () => {
  const cardKey = getCardStateKey({
    subjectSlug: "python-v2",
    moduleSlug: "module-1",
    sectionSlug: "section-1",
    topicId: "topic-1",
    cardId: "sketch-1",
  });

  it("builds a canonical card-scoped tool key", () => {
    expect(getCardToolScopeKey(cardKey)).toBe(
      "card:python-v2:module-1:section-1:topic-1:sketch-1",
    );
  });

  it("parses canonical card tool keys", () => {
    const scopeKey = getCardToolScopeKey(cardKey);

    expect(getCardStateKeyFromToolScopeKey(scopeKey)).toBe(cardKey);
    expect(getCardIdFromToolScopeKey(scopeKey)).toBe("sketch-1");
  });

  it("keeps historical :general progress readable during migration", () => {
    const legacyScopeKey = `${cardKey}:general`;

    expect(getCardStateKeyFromToolScopeKey(legacyScopeKey)).toBe(cardKey);
    expect(getCardIdFromToolScopeKey(legacyScopeKey)).toBe("sketch-1");
  });
});
