import { describe, expect, it } from "vitest";

import { buildDraftQaNavigationSearch } from "./draftQaNavigationSearch";

describe("buildDraftQaNavigationSearch", () => {
  it("replaces a stale topicDir when Draft QA crosses topic boundaries", () => {
    const next = new URLSearchParams(
      buildDraftQaNavigationSearch({
        enabled: true,
        baseSearch:
          "draftPreview=1&source=draft&catalog=python&subject=python--python-data-functions--draft&moduleDir=module5&topicDir=creating-and-indexing-lists&draftQa=1",
        destinationTopicDir: "list-methods-and-mutation",
        fallbackTopicSlug: "list-methods-and-mutation",
      }),
    );

    expect(next.get("topicDir")).toBe("list-methods-and-mutation");
    expect(next.get("source")).toBe("draft");
    expect(next.get("draftQa")).toBe("1");
    expect(next.get("moduleDir")).toBe("module5");
  });

  it("uses the route topic slug only as a fallback", () => {
    const next = new URLSearchParams(
      buildDraftQaNavigationSearch({
        enabled: true,
        baseSearch: "draftQa=1&source=draft&topicDir=old-topic",
        destinationTopicDir: null,
        fallbackTopicSlug: "next-topic",
      }),
    );

    expect(next.get("topicDir")).toBe("next-topic");
  });

  it("does not add Draft QA query state in standard mode", () => {
    expect(
      buildDraftQaNavigationSearch({
        enabled: false,
        baseSearch: "draftQa=1&source=draft&topicDir=old-topic",
        destinationTopicDir: "next-topic",
      }),
    ).toBe("");
  });
});
