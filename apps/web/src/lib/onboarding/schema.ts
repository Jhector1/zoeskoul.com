import { z } from "zod";

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

export const SaveOnboardingSchema = z.object({
    preferredLanguage: PreferredLanguageSchema.optional(),
    learningInterests: z.array(z.string().min(1)).max(10).optional(),
    level: LevelSchema.optional(),
    studyTime: StudyTimeSchema.optional(),
    discoverySource: DiscoverySourceSchema.optional(),
    completed: z.boolean().optional(),
    skipped: z.boolean().optional(),
});

export type SaveOnboardingInput = z.infer<typeof SaveOnboardingSchema>;