import {
  describe,
  expect,
  it,
} from "vitest";

import {
  TutoringCommercialRequestInputSchema,
  TutoringTeacherAvailabilityReplaceSchema,
  TutoringTeacherPoolPatchSchema,
  TutoringTeacherScheduleRequestSchema,
} from "./tutoringCommercialRequest";

const VALID_PREFERRED =
  "2026-09-01T10:00:00-05:00";

describe(
  "TutoringCommercialRequestInputSchema",
  () => {
    it("accepts flexible multi-hour sessions plus a preferred start", () => {
      for (const requestedMinutes of [
        30,
        45,
        60,
        90,
        240,
        720,
      ]) {
        const parsed =
          TutoringCommercialRequestInputSchema.parse({
            requestAttemptId:
              "11111111-1111-4111-8111-111111111111",
            requestedMinutes,
            preferredStartsAt:
              VALID_PREFERRED,
            sourceSubjectSlug:
              "python",
          });

        expect(
          parsed.requestedMinutes,
        ).toBe(requestedMinutes);
        expect(
          parsed.preferredStartsAt,
        ).toBe(VALID_PREFERRED);
      }
    });

    it("rejects below-minimum, fractional, and beyond-ceiling durations", () => {
      for (const requestedMinutes of [
        15,
        30.5,
        735,
      ]) {
        expect(
          TutoringCommercialRequestInputSchema.safeParse({
            requestAttemptId:
              "11111111-1111-4111-8111-111111111111",
            requestedMinutes,
            preferredStartsAt:
              VALID_PREFERRED,
          }).success,
        ).toBe(false);
      }
    });

    it("requires an offset-aware preferred start", () => {
      expect(
        TutoringCommercialRequestInputSchema.safeParse({
          requestAttemptId:
            "11111111-1111-4111-8111-111111111111",
          requestedMinutes: 60,
          preferredStartsAt:
            "2026-09-01T10:00:00",
        }).success,
      ).toBe(false);
    });

    it("requires a client request-attempt UUID", () => {
      expect(
        TutoringCommercialRequestInputSchema.safeParse({
          requestAttemptId:
            "retry-me",
          requestedMinutes: 30,
          preferredStartsAt:
            VALID_PREFERRED,
        }).success,
      ).toBe(false);
    });

    it("keeps teacher-pool mutation limited to enable/disable", () => {
      expect(
        TutoringTeacherPoolPatchSchema.parse({
          enabled: true,
          priority: 1,
          userId: "other-teacher",
        }),
      ).toEqual({
        enabled: true,
      });
    });
  },
);

describe(
  "TutoringTeacherAvailabilityReplaceSchema",
  () => {
    it("accepts offset-aware instants and an IANA timezone", () => {
      const parsed =
        TutoringTeacherAvailabilityReplaceSchema.parse({
          timeZone:
            "America/Chicago",
          windows: [
            {
              startsAt:
                "2026-09-01T09:00:00-05:00",
              endsAt:
                "2026-09-01T12:00:00-05:00",
            },
          ],
        });

      expect(parsed.timeZone).toBe(
        "America/Chicago",
      );
      expect(
        parsed.windows,
      ).toHaveLength(1);
    });

    it("rejects timestamps without an offset", () => {
      expect(
        TutoringTeacherAvailabilityReplaceSchema.safeParse({
          timeZone:
            "America/Chicago",
          windows: [
            {
              startsAt:
                "2026-09-01T09:00:00",
              endsAt:
                "2026-09-01T10:00:00",
            },
          ],
        }).success,
      ).toBe(false);
    });
  },
);

describe(
  "TutoringTeacherScheduleRequestSchema",
  () => {
    it("accepts only an offset-aware start instant", () => {
      expect(
        TutoringTeacherScheduleRequestSchema.parse({
          startsAt:
            "2026-09-01T10:00:00-05:00",
        }),
      ).toEqual({
        startsAt:
          "2026-09-01T10:00:00-05:00",
      });
    });

    it("rejects local timestamps and teacher selection", () => {
      expect(
        TutoringTeacherScheduleRequestSchema.safeParse({
          startsAt:
            "2026-09-01T10:00:00",
        }).success,
      ).toBe(false);

      expect(
        TutoringTeacherScheduleRequestSchema.safeParse({
          startsAt:
            "2026-09-01T10:00:00-05:00",
          teacherId: "teacher-2",
        }).success,
      ).toBe(false);
    });
  },
);
