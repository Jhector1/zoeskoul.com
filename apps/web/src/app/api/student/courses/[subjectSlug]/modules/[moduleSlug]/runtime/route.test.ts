import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  access: {
    authenticated: true,
    user: {
      id: "student-1",
    } as { id: string } | null,
    capabilities: {
      accessStudentApp: true,
      canUnlockAll: false,
    },
  },
}));

vi.mock(
  "@/lib/access/currentUserAccess",
  () => ({
    getCurrentUserAccess: vi.fn(
      async () => mocks.access,
    ),
  }),
);

vi.mock(
  "@/lib/learning/studentCourseReaderData",
  () => ({
    loadStudentModuleOverview: vi.fn(
      async () => ({
        status: "ready",
        data: {
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
          stats: {
            sectionsCount: 1,
            topicsCount: 1,
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
                  order: 1,
                },
              ],
            },
          ],
        },
      }),
    ),
  }),
);

vi.mock(
  "@/lib/subjects/server/resolveSubjectPresentation",
  () => ({
    getResolvedReviewModule: vi.fn(
      async () => ({
        id: "module-1",
        title: "Module 1",
        topics: [
          {
            id: "python.topic-1",
            label: "Topic 1",
            summary: "Practice.",
            cards: [
              {
                type: "sketch",
                id: "sketch-1",
                title: "Sketch",
                sketchId: "private-registry-id",
                props: {
                  expectedSolution: "secret",
                },
              },
            ],
          },
        ],
      }),
    ),
  }),
);

function request(query = "") {
  return new Request(
    "http://localhost:3000/api/student/courses/python/modules/module-1/runtime" +
      query,
    {
      headers: {
        Origin: "http://localhost:3002",
      },
    },
  );
}

const context = {
  params: Promise.resolve({
    subjectSlug: "python",
    moduleSlug: "module-1",
  }),
};

describe("student runtime launch route", () => {
  beforeEach(() => {
    mocks.access.authenticated = true;
    mocks.access.user = {
      id: "student-1",
    };
    mocks.access.capabilities.accessStudentApp = true;
  });

  it("returns 400 when target parameters are absent", async () => {
    const route = await import("./route");
    const response = await route.GET(
      request(),
      context,
    );

    expect(response.status).toBe(400);
    expect(
      response.headers.get(
        "Access-Control-Allow-Origin",
      ),
    ).toBe("http://localhost:3002");
  });

  it("returns the protected verified handoff", async () => {
    const route = await import("./route");
    const response = await route.GET(
      request(
        "?sectionSlug=section-1" +
          "&topicSlug=topic-1" +
          "&ownerCardId=sketch-1" +
          "&targetKind=card" +
          "&targetId=sketch-1" +
          "&runtimeKind=sketch",
      ),
      context,
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body).toMatchObject({
      title: "Sketch",
      activity: {
        kind: "legacy_handoff",
        href:
          "/en/subjects/python/modules/module-1/learn",
      },
    });

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(
      "private-registry-id",
    );
    expect(serialized).not.toContain(
      "expectedSolution",
    );
    expect(serialized).not.toContain(
      "secret",
    );
  });

  it("returns 404 for a target that is not in the lesson", async () => {
    const route = await import("./route");
    const response = await route.GET(
      request(
        "?sectionSlug=section-1" +
          "&topicSlug=topic-1" +
          "&ownerCardId=unknown" +
          "&targetKind=card" +
          "&targetId=unknown" +
          "&runtimeKind=sketch",
      ),
      context,
    );

    expect(response.status).toBe(404);
  });

  it("requires authentication", async () => {
    mocks.access.authenticated = false;
    mocks.access.user = null;

    const route = await import("./route");
    const response = await route.GET(
      request(),
      context,
    );

    expect(response.status).toBe(401);
  });
});
