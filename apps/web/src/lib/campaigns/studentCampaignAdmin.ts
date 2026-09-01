import { z } from "zod";

const NullableShortText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => {
      if (value == null) return null;
      const trimmed = value.trim();
      return trimmed || null;
    });

function validCampaignHref(value: string | null) {
  if (!value) return true;

  if (value.startsWith("/")) {
    return !value.startsWith("//");
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const StudentCampaignWriteSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(2_500),
    ctaLabel: NullableShortText(80),
    ctaHref: NullableShortText(2_048),
    status: z.enum(["draft", "published", "archived"]),
    audience: z.enum(["all", "free", "plus"]),
    displayFrequency: z.enum(["once", "daily", "always"]),
    priority: z.number().int().min(0).max(10_000).default(100),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    enabled: z.boolean(),
    tutoringGrantMinutes: z
      .union([z.number().int().positive().max(10_080), z.null()])
      .optional()
      .default(null),
  })
  .superRefine((value, ctx) => {
    const startsAt = new Date(value.startsAt);
    const endsAt = new Date(value.endsAt);

    if (endsAt.getTime() <= startsAt.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "Campaign end must be after its start.",
      });
    }

    if (!validCampaignHref(value.ctaHref ?? null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ctaHref"],
        message: "CTA must be a relative app path or an HTTP(S) URL.",
      });
    }

    if (
      (value.ctaLabel && !value.ctaHref) ||
      (!value.ctaLabel && value.ctaHref)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ctaHref"],
        message: "CTA label and destination must be configured together.",
      });
    }
  });

export type StudentCampaignWriteInput =
  z.infer<typeof StudentCampaignWriteSchema>;

export function effectiveStudentCampaignEnabled(
  status: StudentCampaignWriteInput["status"],
  enabled: boolean,
) {
  return status === "published" && enabled;
}
