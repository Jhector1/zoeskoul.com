import { describe, expect, it, vi } from "vitest";

import {
  buildSelfPacedPracticeHref,
  startSelfPacedPractice,
} from "./selfPacedPractice";

describe("single self-paced Practice start contract", () => {
  it("starts Lesson/Review module scope through the canonical endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        Response.json({
          sessionId: "lesson-session",
          subjectSlug: "python-v2",
          moduleSlug: "python-v2-1",
          experienceMode: "standard",
          targetCount: 8,
          resumed: false,
          returnUrl: "/en/subjects/python-v2/modules/python-v2-1/learn",
        }),
    );

    const result = await startSelfPacedPractice(
      {
        locale: "en",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
        returnTo: "/en/subjects/python-v2/modules/python-v2-1/learn",
      },
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "/api/practice/session/start",
    );
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)),
    ).toEqual({
      locale: "en",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      returnTo: "/en/subjects/python-v2/modules/python-v2-1/learn",
    });
    expect(result.sessionId).toBe("lesson-session");
    expect(result.href).toContain("sessionId=lesson-session");
    expect(result.href).toContain("mode=standard");
    expect(result.href).not.toContain("section=");
    expect(result.href).not.toContain("topic=");
  });

  it("starts Header-selected scope through the exact same function", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        Response.json({
          sessionId: "header-session",
          subjectSlug: "python-v2",
          moduleSlug: "python-v2-1",
          experienceMode: "standard",
          targetCount: 2,
          resumed: false,
          returnUrl: null,
        }),
    );

    const result = await startSelfPacedPractice(
      {
        locale: "en",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
        sectionSlug: "variables",
        topicSlug: "input-and-type-conversion",
        targetCount: 2,
      },
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "/api/practice/session/start",
    );
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)),
    ).toEqual({
      locale: "en",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      sectionSlug: "variables",
      topicSlug: "input-and-type-conversion",
      targetCount: 2,
    });
    expect(result.href).toContain("sessionId=header-session");
    expect(result.href).toContain("section=variables");
    expect(result.href).toContain(
      "topic=input-and-type-conversion",
    );
    expect(result.href).toContain("questionCount=2");
  });

  it("never returns a self-paced href without a session id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        Response.json({
          experienceMode: "standard",
        }),
    );

    await expect(
      startSelfPacedPractice(
        {
          locale: "en",
          subjectSlug: "python-v2",
          moduleSlug: "python-v2-1",
        },
        { fetchImpl },
      ),
    ).rejects.toThrow(
      "authoritative self-paced session",
    );
  });

  it("builds no sessionless self-paced route", () => {
    expect(() =>
      buildSelfPacedPracticeHref({
        locale: "en",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
        sessionId: "",
      }),
    ).toThrow("sessionId is required");
  });
});
