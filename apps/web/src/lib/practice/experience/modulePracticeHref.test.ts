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

  it("builds optional module Practice as strict practice purpose", () => {
    expect(
      buildModulePracticeHref({
        locale: "en",
        subjectSlug: "python",
        moduleSlug: "python-0",
        mode: "standard",
        returnTo: "/en/subjects/python/modules/python-0/learn",
        preferPurpose: "practice",
        purposePolicy: "strict",
      }),
    ).toBe(
      "/en/subjects/python/modules/python-0/practice?returnTo=%2Fen%2Fsubjects%2Fpython%2Fmodules%2Fpython-0%2Flearn&preferPurpose=practice&purposePolicy=strict",
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
