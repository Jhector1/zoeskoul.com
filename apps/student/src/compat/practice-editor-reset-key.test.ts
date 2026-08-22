import { describe, expect, it } from "vitest";

import { buildStandalonePracticeToolsResetKey } from "../legacy-web/components/practice/tools/useStandalonePracticeTools";

describe("student standalone Practice tools reset identity", () => {
  it("does not reset the provider only because the active exercise changed", () => {
    const first = buildStandalonePracticeToolsResetKey({
      experienceMode: "standard",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      runtimeResetRevision: 4,
    });
    const second = buildStandalonePracticeToolsResetKey({
      experienceMode: "standard",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      runtimeResetRevision: 4,
    });

    expect(second).toBe(first);
  });

  it("still changes for an authoritative runtime reset", () => {
    const before = buildStandalonePracticeToolsResetKey({
      experienceMode: "standard",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      runtimeResetRevision: 4,
    });
    const after = buildStandalonePracticeToolsResetKey({
      experienceMode: "standard",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      runtimeResetRevision: 5,
    });

    expect(after).not.toBe(before);
  });
});
