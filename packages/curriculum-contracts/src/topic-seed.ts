import type { CourseProfileId } from "./blueprint.js";
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

export type TopicSeedRuntimeDefaults = ManifestRuntimeDefaults;

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

    moduleRuntimeDefaults?: TopicSeedRuntimeDefaults | null;
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
    moduleOrder: number;
    sectionOrder: number;
    practice?: PracticeConfig;
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
