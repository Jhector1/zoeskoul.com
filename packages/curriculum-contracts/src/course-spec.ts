import type { BlueprintRuntimePolicy } from "./blueprint.js";
import type { ExerciseKindMix } from "./exercise-policy.js";

export type CourseSpecDifficulty = "beginner" | "intermediate" | "advanced";

export type CourseSpecExercisePolicy = {
    defaultMix?: ExerciseKindMix;
    minimums?: {
        technicalTopicCodeInputMin?: number;
        topicExerciseMin?: number;
    };
};

export type CourseSpecProjectPolicy = {
    minProjectsBeforeCapstone?: number;
    capstoneRequired?: boolean;
};

export type CourseSpecRuntimePolicy = Omit<BlueprintRuntimePolicy, "moduleDatasetIds">;

export type CourseSpecQualityPolicy = {
    allowBlankTopicIds?: boolean;
    allowDuplicateTopicIds?: boolean;
    requireUniqueModuleSlugs?: boolean;
    requireUniqueSectionSlugs?: boolean;
    requireModuleProject?: boolean;
    maxModuleProjectLength?: number;
};

export type CourseSpecReleaseWindow = {
    name: string;
    startModuleNumber: number;
    endModuleNumber: number;
};

export type CourseSpecReleasePlan = {
    currentRelease?: CourseSpecReleaseWindow;
    releases?: CourseSpecReleaseWindow[];
};

export type CourseSpecPolicy = {
    exercisePolicy?: CourseSpecExercisePolicy;
    projectPolicy?: CourseSpecProjectPolicy;
    runtimePolicy?: CourseSpecRuntimePolicy;
    qualityPolicy?: CourseSpecQualityPolicy;
};

export type CourseSpecTopic = {
    topicNumber?: string;
    topicId: string;
    title: string;
    summary?: string;
    minutes?: number;
    difficulty?: CourseSpecDifficulty;
    technical?: boolean;
    tags?: string[];
    learningGoals?: string[];
};

export type CourseSpecSection = {
    sectionNumber?: string;
    sectionSlug: string;
    title: string;
    description?: string;

    weekStart?: number | null;
    weekEnd?: number | null;
    weeksLabel?: string | null;

    bullets?: string[];

    topics: CourseSpecTopic[];
};

export type CourseSpecModule = {
    moduleNumber: number;
    moduleSlug: string;
    order?: number;
    prefix?: string;
    title: string;
    description?: string;
    purpose?: string;
    learningObjectives?: string[];
    guidedExercises?: string[];
    quizFocus?: string[];
    moduleProject?: string;
    weekStart?: number | null;
    weekEnd?: number | null;
    sectionCount?: number;
    topicCount?: number;
    recommendedPacing?: string;
    typicalOutcome?: string;
    exercisePolicy?: {
        mix?: ExerciseKindMix;
    };
    runtimePolicy?: CourseSpecRuntimePolicy;
    sections: CourseSpecSection[];
};

export type CourseSpecAssessmentAndDelivery = {
    suggestedBeginnerRhythm?: string;
    recommendedCourseDeliverables?: string[];
    samplePacingOptions?: Record<string, string[]>;
    toolingSuggestions?: string[];
    closingNote?: string;
    moduleMilestones?: Array<{
        range: string;
        milestone: string;
        learnersCan: string;
    }>;
};

export type CourseSpec = {
    authoringFormatVersion: string;
    subjectSlug: string;
    profileId: string;
    title: string;
    subtitle?: string;
    intendedFor?: string;
    sourceLocale?: string;
    targetLocales?: string[];
    courseOverview?: {
        recommendedSequence?: string;
        summary?: string;
        moduleSummary?: Array<{
            moduleNumber: number;
            title: string;
            coreSkill?: string;
            outputFocus?: string;
        }>;
    };
    releasePlan?: CourseSpecReleasePlan;
    policy?: CourseSpecPolicy;
    authoringGuidance?: string[];
    modules: CourseSpecModule[];
    assessmentAndDelivery?: CourseSpecAssessmentAndDelivery;
};