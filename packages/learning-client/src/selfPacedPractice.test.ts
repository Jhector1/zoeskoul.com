import { describe, expect, it, vi } from "vitest";

import {
  buildSelfPacedPracticeContinuationEntryHref,
  buildSelfPacedPracticeHref,
  startSelfPacedPractice,
} from "./selfPacedPractice";

describe("canonical sessionless self-paced Practice start", () => {
  it("uses one module-only contract for Lesson/Review", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        practiceRunId: "lesson-run",
        practiceRunStartedAt: "2026-08-22T07:00:00.000Z",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-2",
        experienceMode: "practice",
        targetCount: 14,
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
    expect(
      JSON.parse(
        String((fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
      ),
    ).toEqual({
      locale: "en",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      returnTo: "/en/subjects/python-v2/modules/python-v2-2/learn",
    });

    const url = new URL(result.href, "https://zoeskoul.test");
    expect(url.searchParams.get("practiceRunId")).toBe("lesson-run");
    expect(url.searchParams.get("returnTo")).toContain("/learn");
    expect(url.searchParams.get("section")).toBeNull();
    expect(url.searchParams.get("topic")).toBeNull();
    expect(url.searchParams.get("questionCount")).toBeNull();
    expect(url.searchParams.get("difficulty")).toBeNull();
    expect(url.searchParams.get("sessionId")).toBeNull();
    expect(result.targetCount).toBe(14);
  });

  it("uses the exact same progress contract for Header scope", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        practiceRunId: "header-run",
        practiceRunStartedAt: "2026-08-22T07:01:00.000Z",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-2",
        experienceMode: "practice",
        targetCount: 14,
        resumed: false,
        returnUrl: null,
      }),
    );

    const result = await startSelfPacedPractice(
      {
        locale: "en",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-2",
      },
      { fetchImpl },
    );

    expect(
      JSON.parse(
        String((fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
      ),
    ).toEqual({
      locale: "en",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
    });

    const url = new URL(result.href, "https://zoeskoul.test");
    expect(url.searchParams.get("practiceRunId")).toBe("header-run");
    expect(url.searchParams.get("returnTo")).toBeNull();
    expect(url.searchParams.get("section")).toBeNull();
    expect(url.searchParams.get("topic")).toBeNull();
    expect(url.searchParams.get("questionCount")).toBeNull();
    expect(url.searchParams.get("sessionId")).toBeNull();
    expect(result.targetCount).toBe(14);
  });

  it("builds a navigation-only same-module re-entry for billing success", () => {
    const href = buildSelfPacedPracticeContinuationEntryHref({
      locale: "en",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
    });
    const url = new URL(href, "https://zoeskoul.test");

    expect(url.pathname).toBe("/en/practice/daily");
    expect(url.searchParams.get("subject")).toBe("python-v2");
    expect(url.searchParams.get("module")).toBe("python-v2-2");
    expect(url.searchParams.get("continue")).toBe("practice");
    expect(url.searchParams.get("sessionId")).toBeNull();
    expect(url.searchParams.get("questionCount")).toBeNull();
  });

  it("requires URL run identity rather than a database session id", () => {
    expect(() =>
      buildSelfPacedPracticeHref({
        locale: "en",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-2",
        practiceRunId: "",
        practiceRunStartedAt: "2026-08-22T07:00:00.000Z",
      }),
    ).toThrow("practiceRunId is required");
  });
});
