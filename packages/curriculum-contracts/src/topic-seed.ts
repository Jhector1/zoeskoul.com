import type { CourseProfileId } from "./blueprint.js";
import type { CourseSpecProjectBrief } from "./course-spec.js";
import type { PracticeConfig } from "./practice.js";
import type { SqlDatasetArtifact } from "./sql-dataset.js";
import { ExerciseKindKey, ResolvedExercisePolicy } from "./exercise-policy.js";
import {
    ModulePedagogyPolicy,
    ResolvedAuthoringPolicy,
    TopicPedagogyPolicy,
    WorkspaceProfile,
} from "./workspace.js";
import {ManifestRuntimeDefaults} from "./manifest";
import type { ManifestIdeServiceConfig } from "./ide-services.js";
import type { ToolPresentationPolicy } from "./tool-presentation.js";

export type TopicSeedRuntimeDefaults = ManifestRuntimeDefaults;
export type TopicSeedServiceDefaults = ManifestIdeServiceConfig;

export type SqlDatasetGrounding = {
    defaultDatasetId?: string;
    preferredTeachingTable?: string;
    preferredLabelColumn?: string;
    preferredNumericColumns?: string[];
    allowedTables: Record<string, string[]>;
};

export type TopicSeedWorkspacePolicy = {
    workspace: WorkspaceProfile;
    modulePolicy?: ModulePedagogyPolicy;
    topicPolicy?: TopicPedagogyPolicy;
    preferredActionLanguage: string[];
    forbiddenActionLanguage: string[];
    avoidTerms: string[];
    notes: string[];
};
export type TopicSeed = {
    messageBase?: string;
    learningGoals?: string[];
    technical?: boolean;
    /** Authoritative goals for this exact topic, distinct from broad module objectives. */
    topicLearningGoals?: string[];
    /** Effective policy through topic scope. */
    tools?: ToolPresentationPolicy;
    /** Sparse lesson/card overrides keyed by emitted card id or sketch id. */
    lessonTools?: Record<string, ToolPresentationPolicy>;
    /** Sparse exercise overrides keyed by authored exercise id. */
    exerciseTools?: Record<string, ToolPresentationPolicy>;

    moduleRuntimeDefaults?: TopicSeedRuntimeDefaults | null;
    moduleServiceDefaults?: TopicSeedServiceDefaults | null;
    moduleDataset?: SqlDatasetArtifact | null;
    sqlGrounding?: SqlDatasetGrounding | null;

    plannedExerciseCounts?: {
        total: number;
        dominantKind: ExerciseKindKey;
        counts: Record<ExerciseKindKey, number>;
    };

    subjectSlug: string;
    courseSlug?: string;
    profileId: CourseProfileId;
    moduleSlug: string;
    sectionSlug: string;
    topicId: string;
    order: number;
    title: string;
    summary: string;
    minutes: number;
    moduleTitle: string;
    moduleRole?: "standard" | "capstone";
    modulePurpose?: string;
    moduleObjectives: string[];
    guidedExercises: string[];
    quizFocus: string[];
    moduleProject?: string;
    sectionTitle: string;
    sectionRole?: "lesson" | "module_project" | "capstone";
    sourceLocale: string;
    targetLocales: string[];
    exercisePolicy?: ResolvedExercisePolicy;
    workspacePolicy?: TopicSeedWorkspacePolicy;
    authoringPolicy?: ResolvedAuthoringPolicy;
    modulePrefix: string;
    /** Display/logical module number from course.spec.json when available. */
    moduleNumber?: number;
    moduleOrder: number;
    sectionOrder: number;
    practice?: PracticeConfig;
    projectBrief?: CourseSpecProjectBrief;
    generationTargets?: {
        quizBankMin: number;
        quizBankTarget: number;
        quizVisibleDefault: number;
        quizVisibleMax: number;

        projectCodeInputMin: number;
        projectCodeInputTarget: number;
        projectCodeInputMax: number;

        maxAttempts: number | null;
    };
};
