import { describe, expect, it } from "vitest";

import { orderDraftQaTopicsByManifest } from "./draftQaTopicOrder";

describe("orderDraftQaTopicsByManifest", () => {
  it("uses the authored Module 8 section/topic sequence instead of alphabetical folder order", () => {
    const discovered = [
      "class-files-and-instances",
      "constructors-and-object-state",
      "thinking-in-objects",
      "encapsulation-and-validation",
      "methods-and-responsibility",
      "module-8-account-tracker-project",
    ];

    const authored = [
      "thinking-in-objects",
      "class-files-and-instances",
      "constructors-and-object-state",
      "methods-and-responsibility",
      "encapsulation-and-validation",
      "module-8-account-tracker-project",
    ];

    expect(
      orderDraftQaTopicsByManifest(discovered, authored, (topicId) => topicId),
    ).toEqual(authored);
  });

  it("keeps unlisted draft topics after authored topics without scrambling them", () => {
    const discovered = [
      "temporary-audit-topic",
      "constructors-and-object-state",
      "thinking-in-objects",
      "temporary-second-topic",
      "class-files-and-instances",
    ];

    const authored = [
      "thinking-in-objects",
      "class-files-and-instances",
      "constructors-and-object-state",
    ];

    expect(
      orderDraftQaTopicsByManifest(discovered, authored, (topicId) => topicId),
    ).toEqual([
      "thinking-in-objects",
      "class-files-and-instances",
      "constructors-and-object-state",
      "temporary-audit-topic",
      "temporary-second-topic",
    ]);
  });

  it("preserves discovery order when no authored manifest order is available", () => {
    const discovered = ["beta", "alpha", "gamma"];

    expect(
      orderDraftQaTopicsByManifest(discovered, [], (topicId) => topicId),
    ).toEqual(discovered);
  });
});
