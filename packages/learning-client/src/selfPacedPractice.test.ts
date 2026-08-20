import { describe, expect, it, vi } from "vitest";

import {
  buildSelfPacedPracticeHref,
  startSelfPacedPractice,
} from "./selfPacedPractice";

describe("sessionless self-paced Practice start", () => {
  it("uses one stateless endpoint for Lesson/Review", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        practiceRunId: "lesson-run",
        practiceRunStartedAt: "2026-08-20T17:00:00.000Z",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-2",
        experienceMode: "practice",
        targetCount: 12,
        resumed: false,
        returnUrl: "/en/subjects/python-v2/modules/python-v2-2/learn",
      }),
    );

    const result = await startSelfPacedPractice(
      {
        locale: "en",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-2",
        returnTo: "/en/subjects/python-v2/modules/python-v2-2/learn",
      },
      { fetchImpl },
    );

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/practice/start");
    expect(result.href).toContain("practiceRunId=lesson-run");
    expect(result.href).toContain("mode=practice");
    expect(result.href).not.toContain("sessionId=");
  });

  it("uses the exact same contract for Header scope", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        practiceRunId: "header-run",
        practiceRunStartedAt: "2026-08-20T17:01:00.000Z",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-2",
        experienceMode: "practice",
        targetCount: 2,
        resumed: false,
        returnUrl: null,
      }),
    );

    const result = await startSelfPacedPractice(
      {
        locale: "en",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-2",
        topicSlug: "if-elif-else",
        targetCount: 2,
      },
      { fetchImpl },
    );

    expect(result.href).toContain("practiceRunId=header-run");
    expect(result.href).toContain("topic=if-elif-else");
    expect(result.href).toContain("questionCount=2");
    expect(result.href).not.toContain("sessionId=");
  });

  it("requires URL run identity rather than a database session id", () => {
    expect(() =>
      buildSelfPacedPracticeHref({
        locale: "en",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-2",
        practiceRunId: "",
        practiceRunStartedAt: "2026-08-20T17:00:00.000Z",
      }),
    ).toThrow("practiceRunId is required");
  });
});
