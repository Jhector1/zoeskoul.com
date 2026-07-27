import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildStudentLessonContent,
} from "./studentLessonContentData";

describe("buildStudentLessonContent", () => {
  it("whitelists reading and video content without exposing exercise answers", () => {
    const result = buildStudentLessonContent({
      overview: {
        subject: {
          id: "subject-1",
          slug: "python",
          title: "Python",
          description: null,
          imagePublicId: null,
          imageAlt: null,
        },
        module: {
          id: "module-1",
          slug: "python-1",
          title: "Python basics",
          description: "Learn Python.",
          order: 0,
          weekStart: null,
          weekEnd: null,
          meta: {
            estimatedMinutes: 30,
            prereqs: [],
            outcomes: [],
            why: [],
            videoUrl: null,
          },
        },
        stats: {
          sectionsCount: 1,
          topicsCount: 1,
        },
        access: {
          ok: true,
          paid: false,
          reason: "available",
        },
        sections: [
          {
            slug: "section-a",
            title: "Start",
            description: null,
            order: 0,
            topics: [
              {
                slug: "py8.variables",
                title: "Variables",
                order: 0,
              },
            ],
          },
        ],
      },
      reviewModule: {
        id: "python-1",
        title: "Python basics",
        startPracticeSectionSlug: "section-a",
        topics: [
          {
            id: "variables",
            label: "Variables",
            summary: "Store values by name.",
            cards: [
              {
                type: "text",
                id: "read-1",
                title: "What is a variable?",
                markdown: "A variable gives a value a name.",
                tryIt: {
                  id: "try-1",
                  exerciseKey: "secret-exercise",
                  spec: {
                    mode: "project",
                    subject: "python",
                    steps: [
                      {
                        id: "step-1",
                        solutionCode: "SECRET",
                      },
                    ],
                  },
                },
              },
              {
                type: "video",
                id: "video-1",
                title: "Watch",
                url: "https://example.com/video",
              },
              {
                type: "quiz",
                id: "quiz-1",
                title: "Check",
                spec: {
                  subject: "python",
                  exerciseKeys: ["secret-exercise"],
                },
              },
            ],
          },
        ],
      } as any,
    });

    expect(
      result.sections[0]?.topics[0],
    ).toMatchObject({
      slug: "py8.variables",
      summary: "Store values by name.",
      cards: [
        {
          type: "text",
          id: "read-1",
          runtimeRequired: true,
        },
        {
          type: "video",
          id: "video-1",
        },
        {
          type: "runtime",
          id: "quiz-1",
          runtimeKind: "quiz",
        },
      ],
    });

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("secret-exercise");
    expect(serialized).not.toContain('"spec"');
    expect(serialized).not.toContain("solutionCode");
  });
});
