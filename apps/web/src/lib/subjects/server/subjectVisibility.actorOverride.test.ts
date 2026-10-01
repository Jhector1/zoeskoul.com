import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  actorKeyOf: vi.fn(),
  practiceSubjectFindMany: vi.fn(),
  subjectEnrollmentFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/practice/actor", () => ({
  getActor: mocks.getActor,
  actorKeyOf: mocks.actorKeyOf,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    practiceSubject: {
      findMany: mocks.practiceSubjectFindMany,
    },
    subjectEnrollment: {
      findMany: mocks.subjectEnrollmentFindMany,
    },
  },
}));

vi.mock(
  "@/lib/subjects/subjectCardPresentation",
  () => ({
    mergeSubjectCardPresentation: (
      subject: unknown,
    ) => subject,
  }),
);

import {
  withSubjectCardState,
} from "./subjectVisibility";

describe(
  "withSubjectCardState actor reuse",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.getActor.mockResolvedValue({
        userId: "fallback-user",
        guestId: null,
      });

      mocks.actorKeyOf.mockReturnValue(
        "u:resolved",
      );

      mocks.practiceSubjectFindMany
        .mockResolvedValue([
          {
            id: "subject-1",
            slug: "python",
            order: 1,
            visibility: "public",
            title: "Python",
            description: null,
            imagePublicId: null,
            imageAlt: null,
            modules: [
              {
                slug: "intro",
              },
            ],
          },
        ]);

      mocks.subjectEnrollmentFindMany
        .mockResolvedValue([
          {
            subjectId: "subject-1",
            lastSeenAt: null,
          },
        ]);
    });

    it(
      "uses a supplied authenticated actor without resolving session identity again",
      async () => {
        const actor = {
          userId: "user-1",
          guestId: null,
        };

        await withSubjectCardState(
          [
            {
              slug: "python",
              title: "Python",
              description: null,
            } as any,
          ],
          actor,
        );

        expect(
          mocks.getActor,
        ).not.toHaveBeenCalled();

        expect(
          mocks.actorKeyOf,
        ).toHaveBeenCalledWith(actor);

        expect(
          mocks.subjectEnrollmentFindMany,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "preserves session actor resolution when no actor is supplied",
      async () => {
        await withSubjectCardState([
          {
            slug: "python",
            title: "Python",
            description: null,
          } as any,
        ]);

        expect(
          mocks.getActor,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.actorKeyOf,
        ).toHaveBeenCalledWith({
          userId: "fallback-user",
          guestId: null,
        });
      },
    );
  },
);
