import type { BlueprintRuntimePolicy, CourseVersionStatus } from "./blueprint.js";
import type { ExerciseKindMix } from "./exercise-policy.js";
import type { PracticeConfig } from "./practice.js";
import type { ToolPresentationPolicy } from "./tool-presentation.js";
import type {
    CourseGenerationPolicy,
    ModulePedagogyPolicy,
    ResolvedAuthoringPolicy,
    TopicPedagogyPolicy,
    WorkspaceProfile,
} from "./workspace.js";

export type CourseSpecDifficulty = "beginner" | "intermediate" | "advanced";

export type CourseSpecProjectStep = {
    step: number;
    title: string;
    requirement: string;
};

export type CourseSpecProjectBrief = {
    scenario?: string;
    role?: string;
    workspace?: string;
    deliverable?: string;
    stepCountTarget: number;
    flow?: "standalone" | "progressive";
    requirements?: string[];
    stepLadder?: CourseSpecProjectStep[];
};

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
    slugConvention?: "explicit_module_section";
    requireModuleProject?: boolean;
    maxModuleProjectLength?: number;
    maxAdjacentDifficultyJump?: number;
    reservedConceptsByModule?: Array<{
        concept: string;
        earliestModuleNumber: number;
    }>;
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
    practice?: PracticeConfig;
    projectBrief?: CourseSpecProjectBrief;
    /** Topic-level Tools presentation override. */
    tools?: ToolPresentationPolicy;
    /** Sparse lesson/card overrides keyed by emitted card id (for example sketch0, quiz, project). */
    lessonTools?: Record<string, ToolPresentationPolicy>;
    /** Sparse exercise overrides keyed by authored exercise id. */
    exerciseTools?: Record<string, ToolPresentationPolicy>;
};

export type CourseSpecSection = {
    sectionNumber?: string;
    sectionSlug: string;
    title: string;
    description?: string;
    role?: "lesson" | "module_project" | "capstone";

    weekStart?: number | null;
    weekEnd?: number | null;
    weeksLabel?: string | null;

    bullets?: string[];
    practiceDefaults?: PracticeConfig;
    tools?: ToolPresentationPolicy;

    topics: CourseSpecTopic[];
};

export type CourseSpecModule = {
    moduleNumber: number;
    moduleSlug: string;
    order?: number;
    prefix?: string;
    role?: "standard" | "capstone";
    accessOverride?: "free" | "paid" | null;
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
    practiceDefaults?: PracticeConfig;
    tools?: ToolPresentationPolicy;
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
    accessPolicy?: "free" | "paid";
    moduleAccessOverrideDefault?: "free" | "paid" | null;
    profileId: string;
    title: string;
    description?: string;
    /** Course-level Tools presentation override layered over blueprint/subject defaults. */
    tools?: ToolPresentationPolicy;

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
    practiceDefaults?: PracticeConfig;
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
