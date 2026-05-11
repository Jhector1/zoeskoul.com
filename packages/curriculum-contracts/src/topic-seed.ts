import type { CourseProfileId } from "./blueprint.js";
import type { SqlDatasetArtifact } from "./sql-dataset.js";
import { ExerciseKindKey, ResolvedExercisePolicy } from "./exercise-policy.js";
import {ModulePedagogyPolicy, TopicPedagogyPolicy, WorkspaceProfile} from "./workspace.js";
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

    moduleRuntimeDefaults?: TopicSeedRuntimeDefaults | null;
    moduleDataset?: SqlDatasetArtifact | null;
    sqlGrounding?: SqlDatasetGrounding | null;

    plannedExerciseCounts?: {
        total: number;
        dominantKind: ExerciseKindKey;
        counts: Record<ExerciseKindKey, number>;
    };

    subjectSlug: string;
    profileId: CourseProfileId;
    moduleSlug: string;
    sectionSlug: string;
    topicId: string;
    order: number;
    title: string;
    summary: string;
    minutes: number;
    moduleTitle: string;
    modulePurpose?: string;
    moduleObjectives: string[];
    guidedExercises: string[];
    quizFocus: string[];
    moduleProject?: string;
    sectionTitle: string;
    sourceLocale: string;
    targetLocales: string[];
    exercisePolicy?: ResolvedExercisePolicy;
    workspacePolicy?: TopicSeedWorkspacePolicy;
    modulePrefix: string;
    moduleOrder: number;
    sectionOrder: number;
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
