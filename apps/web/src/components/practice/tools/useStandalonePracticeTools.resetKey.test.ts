import { describe, expect, it } from "vitest";

import { buildStandalonePracticeToolsResetKey } from "./useStandalonePracticeTools";

describe("standalone Practice tools reset identity", () => {
  it("stays stable across exercise navigation inside one module", () => {
    const first = buildStandalonePracticeToolsResetKey({
      experienceMode: "standard",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      runtimeResetRevision: 7,
    });
    const second = buildStandalonePracticeToolsResetKey({
      experienceMode: "standard",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      runtimeResetRevision: 7,
    });

    expect(second).toBe(first);
  });

  it("changes only when the owning run/module scope or explicit reset changes", () => {
    const base = buildStandalonePracticeToolsResetKey({
      experienceMode: "daily_five",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      runtimeResetRevision: 2,
    });

    expect(
      buildStandalonePracticeToolsResetKey({
        experienceMode: "daily_five",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-2",
        runtimeResetRevision: 2,
      }),
    ).not.toBe(base);

    expect(
      buildStandalonePracticeToolsResetKey({
        experienceMode: "daily_five",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
        runtimeResetRevision: 3,
      }),
    ).not.toBe(base);
  });
});
