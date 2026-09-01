import { z } from "zod";

import {
  MAX_TUTORING_MINUTES,
  MIN_TUTORING_MINUTES,
} from "@/lib/tutoring/tutoringPricing";

const TutoringMinutesSchema = z
  .number()
  .int()
  .min(MIN_TUTORING_MINUTES)
  .max(MAX_TUTORING_MINUTES);

export const TutoringCommercialRequestInputSchema =
  z
    .object({
      requestAttemptId:
        z.string().uuid(),
      requestedMinutes:
        TutoringMinutesSchema,
      preferredStartsAt:
        z.string().datetime({
          offset: true,
        }),
      sourceSubjectSlug: z
        .string()
        .trim()
        .min(1)
        .max(160)
        .nullable()
        .optional(),
      sourceModuleSlug: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .nullable()
        .optional(),
      sourceExerciseKey: z
        .string()
        .trim()
        .min(1)
        .max(600)
        .nullable()
        .optional(),
      note: z
        .string()
        .trim()
        .max(2000)
        .nullable()
        .optional(),
    })
    .strict();

export type TutoringCommercialRequestInput =
  z.infer<
    typeof TutoringCommercialRequestInputSchema
  >;

export const TutoringTeacherPoolPatchSchema =
  z.object({
    enabled: z.boolean(),
  });

export const TutoringTeacherAvailabilityWindowSchema =
  z.object({
    startsAt:
      z.string().datetime({
        offset: true,
      }),
    endsAt:
      z.string().datetime({
        offset: true,
      }),
  });

export const TutoringTeacherAvailabilityReplaceSchema =
  z.object({
    timeZone:
      z.string().trim().min(1).max(100),
    windows: z
      .array(
        TutoringTeacherAvailabilityWindowSchema,
      )
      .max(200),
  });

export type TutoringTeacherAvailabilityReplaceInput =
  z.infer<
    typeof TutoringTeacherAvailabilityReplaceSchema
  >;

export const TutoringTeacherScheduleRequestSchema =
  z
    .object({
      startsAt:
        z.string().datetime({
          offset: true,
        }),
    })
    .strict();
