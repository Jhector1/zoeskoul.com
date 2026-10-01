import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  getLearningAssignmentsForUser: vi.fn(),
  resolveSubjectDeliveryPresentations: vi.fn(),
  subjectEnrollmentFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subjectEnrollment: {
      findMany: mocks.subjectEnrollmentFindMany,
    },
    user: {
      findUnique: vi.fn(),
    },
    tutoringSession: {
      findMany: vi.fn(),
    },
    tutoringSessionInvite: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock(
  "@/lib/learningAssignments/assignmentAccessServer",
  () => ({
    getLearningAssignmentsForUser:
      mocks.getLearningAssignmentsForUser,
  }),
);

vi.mock(
  "@/lib/subjects/resolveSubjectDeliveryPresentation",
  () => ({
    resolveSubjectDeliveryPresentations:
      mocks.resolveSubjectDeliveryPresentations,
  }),
);

vi.mock(
  "@/lib/tutoring/sessionAccess",
  () => ({
    tutoringParticipantWhere: vi.fn(),
  }),
);

vi.mock(
  "@/lib/tutoring/sessionInvites",
  () => ({
    tutoringSessionInviteState: vi.fn(),
  }),
);

import {
  loadAssignedLearningForUser,
} from "./myLearningData";

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return {
    promise,
    resolve,
  };
}

describe(
  "My Learning assignment parallelization",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.getLearningAssignmentsForUser
        .mockResolvedValue([
          {
            id: "assignment-1",
            subject: {
              id: "subject-1",
              slug: "python",
              title: "Python",
              description: null,
            },
          },
        ]);
    });

    it(
      "starts enrollment lookup before presentation resolution completes",
      async () => {
        const presentations =
          deferred<any[]>();

        const enrollments =
          deferred<Array<{
            subjectId: string;
          }>>();

        mocks.resolveSubjectDeliveryPresentations
          .mockReturnValue(
            presentations.promise,
          );

        mocks.subjectEnrollmentFindMany
          .mockReturnValue(
            enrollments.promise,
          );

        const resultPromise =
          loadAssignedLearningForUser({
            userId: "user-1",
            locale: "en",
          });

        await vi.waitFor(() => {
          expect(
            mocks.resolveSubjectDeliveryPresentations,
          ).toHaveBeenCalledTimes(1);

          expect(
            mocks.subjectEnrollmentFindMany,
          ).toHaveBeenCalledTimes(1);
        });

        expect(
          mocks.subjectEnrollmentFindMany,
        ).toHaveBeenCalledWith({
          where: {
            userId: "user-1",
            subjectId: {
              in: ["subject-1"],
            },
            status: {
              in: ["enrolled", "completed"],
            },
          },
          select: {
            subjectId: true,
          },
        });

        presentations.resolve([
          {
            id: "subject-1",
            slug: "python",
            title: "Localized Python",
            description: null,
          },
        ]);

        enrollments.resolve([
          {
            subjectId: "subject-1",
          },
        ]);

        const result =
          await resultPromise;

        expect(result).toHaveLength(1);

        expect(result[0]).toMatchObject({
          id: "assignment-1",
          enrolled: true,
          subject: {
            id: "subject-1",
            title: "Localized Python",
          },
        });
      },
    );
  },
);
