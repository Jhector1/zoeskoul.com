import type { BlueprintRuntimePolicy, CourseVersionStatus } from "./blueprint.js";
import type { ExerciseKindMix } from "./exercise-policy.js";
import type {
    CourseGenerationPolicy,
    ModulePedagogyPolicy,
    ResolvedAuthoringPolicy,
    TopicPedagogyPolicy,
    WorkspaceProfile,
} from "./workspace.js";

export type CourseSpecDifficulty = "beginner" | "intermediate" | "advanced";

export type CourseSpecExercisePolicy = {
    defaultMix?: ExerciseKindMix;
    minimums?: {
        technicalTopicCodeInputMin?: number;
        topicExerciseMin?: number;
    };
    generationTargets?: {
        quizBankMin?: number;
        quizBankTarget?: number;
        quizVisibleDefault?: number;
        quizVisibleMax?: number;

        projectCodeInputMin?: number;
        projectCodeInputTarget?: number;
        projectCodeInputMax?: number;

        maxAttempts?: number | null;
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
    courseSlug: string;
    catalogSlug: string;
    profileId: string;
    title: string;
    sourceLocale: string;
    targetLocales: string[];
    trackSlug?: string;
    courseNumber?: number;
    status?: CourseVersionStatus;
    subtitle?: string;
    prerequisites?: string[];
    recommendedPrerequisites?: string[];
    moduleRange?: {
        start?: number;
        end?: number;
        label?: string;
    };
    versioning?: {
        family: string;
        version: number;
        status: CourseVersionStatus;
        defaultForNewEnrollments?: boolean;
        supersedes?: string | null;
        supersededBy?: string | null;
    };
    validationPolicy?: unknown;
    intendedFor?: string | string[];
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
    workspaceProfileId?: string;
    workspacePolicyId?: string;
    workspaceOverrides?: Partial<WorkspaceProfile>;
    courseGenerationPolicy?: CourseGenerationPolicy;
    modulePolicies?: ModulePedagogyPolicy[];
    topicPolicies?: Record<string, TopicPedagogyPolicy>;
    resolvedAuthoringPolicy?: ResolvedAuthoringPolicy;
};
