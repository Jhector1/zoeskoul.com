import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  tutoringSessionFindMany: vi.fn(),
  tutoringSessionInviteFindMany: vi.fn(),
  resolveSubjectDeliveryPresentations: vi.fn(),
  tutoringParticipantWhere: vi.fn(),
  tutoringSessionInviteState: vi.fn(),
  getLearningAssignmentsForUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    tutoringSession: {
      findMany: mocks.tutoringSessionFindMany,
    },
    tutoringSessionInvite: {
      findMany:
        mocks.tutoringSessionInviteFindMany,
    },
    subjectEnrollment: {
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
    tutoringParticipantWhere:
      mocks.tutoringParticipantWhere,
  }),
);

vi.mock(
  "@/lib/tutoring/sessionInvites",
  () => ({
    tutoringSessionInviteState:
      mocks.tutoringSessionInviteState,
  }),
);

import {
  loadTutoringLearningForUser,
} from "./myLearningData";

describe(
  "My Learning tutoring read path",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.tutoringSessionFindMany
        .mockResolvedValue([]);

      mocks.tutoringSessionInviteFindMany
        .mockResolvedValue([]);

      mocks.resolveSubjectDeliveryPresentations
        .mockImplementation(
          async (subjects: unknown[]) =>
            subjects,
        );

      mocks.tutoringParticipantWhere
        .mockReturnValue({
          users: {
            some: {
              userId: "user_1",
            },
          },
        });

      mocks.userFindUnique
        .mockResolvedValue({
          email: "database@example.com",
        });
    });

    it(
      "reuses the already resolved account email without a user lookup or invite mutation",
      async () => {
        await loadTutoringLearningForUser({
          userId: "user_1",
          userEmail:
            " USER@EXAMPLE.COM ",
          locale: "en",
        });

        expect(
          mocks.userFindUnique,
        ).not.toHaveBeenCalled();

        expect(
          mocks.tutoringSessionFindMany,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.tutoringSessionInviteFindMany,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.tutoringSessionInviteFindMany,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where:
              expect.objectContaining({
                OR: [
                  {
                    invitedUserId:
                      "user_1",
                  },
                  {
                    email:
                      "user@example.com",
                  },
                ],
              }),
          }),
        );
      },
    );

    it(
      "preserves the database email fallback for callers that do not already own resolved user access",
      async () => {
        await loadTutoringLearningForUser({
          userId: "user_1",
          locale: "en",
        });

        expect(
          mocks.userFindUnique,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.userFindUnique,
        ).toHaveBeenCalledWith({
          where: {
            id: "user_1",
          },
          select: {
            email: true,
          },
        });

        expect(
          mocks.tutoringSessionInviteFindMany,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where:
              expect.objectContaining({
                OR: [
                  {
                    invitedUserId:
                      "user_1",
                  },
                  {
                    email:
                      "database@example.com",
                  },
                ],
              }),
          }),
        );
      },
    );
  },
);
