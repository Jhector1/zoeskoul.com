import { describe, expect, it } from "vitest";
import { buildModulePracticeHref } from "./modulePracticeHref";

describe("buildModulePracticeHref", () => {
  it("builds subscriber practice without assignment query state", () => {
    expect(
      buildModulePracticeHref({
        locale: "en",
        subjectSlug: "python",
        moduleSlug: "python-0",
        sessionId: "s1",
        mode: "standard",
        topicSlug: "variables",
      }),
    ).toBe(
      "/en/subjects/python/modules/python-0/practice?sessionId=s1&topic=variables",
    );
  });

  it("builds assignment practice on the same canonical route", () => {
    const href = buildModulePracticeHref({
      locale: "en",
      subjectSlug: "python",
      moduleSlug: "python-0",
      sessionId: "a1",
      mode: "assignment",
      returnTo: "/en/subjects/python/modules/python-0/learn",
    });

    expect(href).toContain(
      "/en/subjects/python/modules/python-0/practice?sessionId=a1&type=assignment",
    );
    expect(href).toContain("returnTo=");
  });
});
