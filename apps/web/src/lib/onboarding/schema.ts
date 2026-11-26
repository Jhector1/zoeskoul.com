import { z } from "zod";

export const ONBOARDING_VERSION = 2;

export const PreferredLanguageSchema = z.enum([
    "english",
    "french",
    "haitian-creole",
]);

export const LevelSchema = z.enum([
    "beginner",
    "intermediate",
    "advanced",
]);

export const StudyTimeSchema = z.enum([
    "1-2-hours",
    "3-5-hours",
    "6-plus-hours",
]);

export const DiscoverySourceSchema = z.enum([
    "search",
    "friend",
    "social",
    "school-work",
    "other",
]);

export const OnboardingUseModeSchema = z.enum([
    "learner",
    "teacher",
    "both",
]);

export const OnboardingAffiliationSchema = z.enum([
    "independent",
    "institution",
]);

export const OnboardingDepartmentContextSchema = z.enum([
    "learner",
    "teacher",
]);

export const OnboardingDepartmentSelectionSchema = z.object({
    departmentKey: z
        .string()
        .min(1)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    context: OnboardingDepartmentContextSchema,
});

export const SaveOnboardingSchema = z.object({
    useMode: OnboardingUseModeSchema.optional(),
    learnerAffiliation: OnboardingAffiliationSchema.optional(),
    teacherAffiliation: OnboardingAffiliationSchema.optional(),
    departmentSelections: z
        .array(OnboardingDepartmentSelectionSchema)
        .max(24)
        .optional(),
    preferredLanguage: PreferredLanguageSchema.optional(),
    learningInterests: z.array(z.string().min(1)).max(20).optional(),
    level: LevelSchema.optional(),
    studyTime: StudyTimeSchema.optional(),
    discoverySource: DiscoverySourceSchema.optional(),
    completed: z.boolean().optional(),
    skipped: z.boolean().optional(),
});

export type SaveOnboardingInput = z.infer<typeof SaveOnboardingSchema>;
export type PreferredLanguage = z.infer<typeof PreferredLanguageSchema>;
export type Level = z.infer<typeof LevelSchema>;
export type StudyTime = z.infer<typeof StudyTimeSchema>;
export type DiscoverySource = z.infer<typeof DiscoverySourceSchema>;
export type OnboardingUseMode = z.infer<typeof OnboardingUseModeSchema>;
export type OnboardingAffiliation = z.infer<typeof OnboardingAffiliationSchema>;
export type OnboardingDepartmentContext = z.infer<
    typeof OnboardingDepartmentContextSchema
>;

export function parseStoredOnboardingChoice<TSchema extends z.ZodType>(
    schema: TSchema,
    value: unknown,
): z.infer<TSchema> | "" {
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : "";
}
