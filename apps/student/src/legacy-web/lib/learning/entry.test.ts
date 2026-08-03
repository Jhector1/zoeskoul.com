import { describe, expect, it } from "vitest";

import {
  buildModuleLearningHref,
  createContinueLearningEntry,
  createStartLearningEntry,
  parseLearningEntry,
} from "./entry";

describe("learning entry", () => {
  it("builds the canonical module learning route", () => {
    expect(
      buildModuleLearningHref({
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-module-1",
      }),
    ).toBe("/subjects/python-v2/modules/python-v2-module-1/learn");
  });

  it("encodes route segments", () => {
    expect(
      createContinueLearningEntry({
        subjectSlug: "python basics",
        moduleSlug: "module/one",
      }),
    ).toEqual({
      kind: "continue",
      href: "/subjects/python%20basics/modules/module%2Fone/learn",
    });
  });

  it("uses the subjects page when no resumable lesson exists", () => {
    expect(createStartLearningEntry()).toEqual({
      kind: "start",
      href: "/subjects",
    });
  });

  it("rejects malformed or external API payloads", () => {
    expect(parseLearningEntry({ kind: "continue", href: "https://bad.test" })).toBeNull();
    expect(parseLearningEntry({ kind: "continue", href: "//bad.test" })).toBeNull();
    expect(parseLearningEntry({ kind: "unknown", href: "/subjects" })).toBeNull();
  });
});
