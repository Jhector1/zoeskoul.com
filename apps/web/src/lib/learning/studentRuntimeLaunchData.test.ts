import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isLearningRuntimeLaunchResponse,
} from "@zoeskoul/learning-contracts";

import {
  buildStudentRuntimeLaunch,
  parseStudentRuntimeTarget,
} from "./studentRuntimeLaunchData";

const target = {
  version: 1 as const,
  sectionSlug: "section-1",
  topicSlug: "topic-1",
  ownerCardId: "sketch-1",
  targetKind: "card" as const,
  targetId: "sketch-1",
  runtimeKind: "sketch" as const,
};

const lesson = {
  subject: {
    id: "python",
    slug: "python",
    title: "Python",
    description: null,
    imagePublicId: null,
    imageAlt: null,
  },
  module: {
    id: "module-1",
    slug: "module-1",
    title: "Module 1",
    description: null,
    order: 1,
    weekStart: null,
    weekEnd: null,
    meta: {
      estimatedMinutes: null,
      prereqs: [],
      outcomes: [],
      why: [],
      videoUrl: null,
    },
  },
  access: {
    ok: true,
    paid: true,
    reason: "enrolled",
  },
  sections: [
    {
      slug: "section-1",
      title: "Section 1",
      description: null,
      order: 1,
      topics: [
        {
          slug: "topic-1",
          title: "Topic 1",
          summary: null,
          order: 1,
          cards: [
            {
              type: "runtime",
              id: "sketch-1",
              title: "Sketch",
              runtimeKind: "sketch",
              runtime: target,
            },
          ],
        },
      ],
    },
  ],
};

describe("student runtime launch data", () => {
  it("parses complete runtime target parameters", () => {
    const params = new URLSearchParams({
      sectionSlug: "section-1",
      topicSlug: "topic-1",
      ownerCardId: "sketch-1",
      targetKind: "card",
      targetId: "sketch-1",
      runtimeKind: "sketch",
    });

    expect(
      parseStudentRuntimeTarget(params),
    ).toEqual(target);
  });

  it("rejects incomplete or inconsistent targets", () => {
    expect(
      parseStudentRuntimeTarget(
        new URLSearchParams({
          sectionSlug: "section-1",
        }),
      ),
    ).toBeNull();

    expect(
      parseStudentRuntimeTarget(
        new URLSearchParams({
          sectionSlug: "section-1",
          topicSlug: "topic-1",
          ownerCardId: "try-1",
          targetKind: "embedded_try_it",
          targetId: "try-1",
          runtimeKind: "quiz",
        }),
      ),
    ).toBeNull();
  });

  it("returns a verified relative legacy handoff", () => {
    const result = buildStudentRuntimeLaunch({
      lesson: lesson as never,
      target,
      locale: "en",
      subjectSlug: "python",
      moduleSlug: "module-1",
    });

    expect(result).toMatchObject({
      target,
      title: "Sketch",
      activity: {
        kind: "legacy_handoff",
        href:
          "/en/subjects/python/modules/module-1/learn",
        reason: "runtime_not_migrated",
      },
    });
    expect(
      isLearningRuntimeLaunchResponse(result),
    ).toBe(true);
  });

  it("does not accept a target outside the protected lesson outline", () => {
    expect(
      buildStudentRuntimeLaunch({
        lesson: lesson as never,
        target: {
          ...target,
          targetId: "another-sketch",
        },
        locale: "en",
        subjectSlug: "python",
        moduleSlug: "module-1",
      }),
    ).toBeNull();
  });
});
