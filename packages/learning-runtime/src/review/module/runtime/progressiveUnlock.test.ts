import { describe, expect, it } from "vitest";

import { computeProgressiveUnlock } from "./progressiveUnlock";

describe("computeProgressiveUnlock", () => {
  it("continues to reject a genuinely locked target", () => {
    const firstKey = "card:first";
    const secondKey = "card:second";
    const registry = {
      orderedKeys: [firstKey, secondKey],
      byRoute: {},
      byKey: {
        [firstKey]: {
          targetKey: firstKey,
          ownerKind: "card",
          ownerKey: firstKey,
          cardKey: "first",
          cardId: "first",
          cardType: "text",
          topicId: "topic",
          topicSlug: "topic",
          sectionSlug: "section",
          targetKind: "text",
          targetSlug: "first",
          routeKey: "section/topic/text/first",
          toolScopeKey: firstKey,
          item: null,
        },
        [secondKey]: {
          targetKey: secondKey,
          ownerKind: "card",
          ownerKey: secondKey,
          cardKey: "second",
          cardId: "second",
          cardType: "text",
          topicId: "topic",
          topicSlug: "topic",
          sectionSlug: "section",
          targetKind: "text",
          targetSlug: "second",
          routeKey: "section/topic/text/second",
          toolScopeKey: secondKey,
          item: null,
        },
      },
    } as any;

    const result = computeProgressiveUnlock({
      registry,
      progress: { topics: {} },
      progressHydrated: true,
      unlockAll: false,
    });

    expect(result.unlockedTargetKeys.has(firstKey)).toBe(true);
    expect(result.lockedTargetKeys.has(secondKey)).toBe(true);
  });
});
