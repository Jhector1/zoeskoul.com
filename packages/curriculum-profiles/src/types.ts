import type {
    ExerciseKind,
    ManifestCodeInput,
    ManifestRuntimeDefaults,
    PlannedModule,
    ProfileAdapter,
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
    ToolPresentationPolicy,
    WorkspaceLanguage,
} from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "./shapes/types.js";

export type RecipeResolvedArgs = {
    title: string;
    prompt: string;
    hint?: string;
    starterCode: string;
    help?: unknown;
    expectedExampleMeta?: string;
    maybeT?: (key: string) => string | undefined;
};

export type ProfilePromptMode = "authoring" | "repair";

export type ProfileCodeInputDraft = Extract<
    TopicAuthoringDraft["quizDraft"][number],
    { kind: "code_input" }
>;

export type CodeInputHelpFallback = {
    hint: string;
    help: {
        concept: string;
        hint_1: string;
        hint_2: string;
    };
};

export type ProjectTopicKind = "module_project" | "capstone";

export type ProjectExerciseCandidate = TopicAuthoringDraft["quizDraft"][number];

export type ProjectProfileConfig = {
    preferredProjectExerciseKind?: ExerciseKind | null;

    minStepCount: number;
    targetStepCount: number;

    allowReveal: boolean;

    tryItDefault: {
        enabled: boolean;
        placement?: "first_sketch" | "all_sketches" | "none";
        sketchIndex: number;
        allowReveal: boolean;
    };

    projectFlowDefault: "standalone" | "progressive";

    projectTitle: string;
    projectStepLabel: string;

    startPromptPrefix: string;
    continuePromptPrefix: string;
    helpConcept: string;
};
export type ProjectProfileCapability = {
    getProjectConfig(args: {
        seed: TopicSeed;
        topicKind: ProjectTopicKind;
    }): ProjectProfileConfig;
    isProjectExercise(args: {
        exercise: ProjectExerciseCandidate;
        seed: TopicSeed;
        topicKind: ProjectTopicKind;
    }): boolean;
};

export type PracticeProfileConfig = {
    tryItDefault: {
        enabled: boolean;
        placement?: "first_sketch" | "all_sketches" | "none";
        sketchIndex: number;
        allowReveal: boolean;
    };
    preferredTryItExerciseKind?: ExerciseKind | null;
};

export type RecipeHandler<TDef = unknown, TArgs = unknown, TResult = unknown> = (
    def: TDef,
    args: TArgs,
    resolved: RecipeResolvedArgs,
) => TResult;

export type CodeInputProfileCapability = {
    minimumFixedTests?: number;
    defaultStarter(args: {
        language?: string;
        recipeType?: string;
        hasDatasetId?: boolean;
    }): string;
    defaultRecipeType(args: {
        exercise: ProfileCodeInputDraft;
        seed: TopicSeed;
    }): ProfileCodeInputDraft["recipeType"] | undefined;
    repairDraft?(args: {
        exercise: ProfileCodeInputDraft;
        seed: TopicSeed;
    }): ProfileCodeInputDraft;
    getHelpFallback?(args: {
        title: string;
        prompt: string;
        seed?: TopicSeed;
    }): CodeInputHelpFallback;
    showExpectedExample?(args: {
        exercise: ProfileCodeInputDraft;
        seed: TopicSeed;
        recipeType?: ProfileCodeInputDraft["recipeType"] | undefined;
    }): boolean;
    buildManifest(args: {
        exercise: ProfileCodeInputDraft;
        seed: TopicSeed;
        messageBase: string;
    }): ManifestCodeInput;
};

export type CourseProfile = {
    id: string;
    shape: SubjectShapePack;
    runtimeKind?: ManifestRuntimeDefaults["kind"];
    defaultLanguage?: WorkspaceLanguage;
    defaultEntryFileName?: string;
    /** Lowest-priority Tools presentation defaults for this profile. */
    defaultTools?: ToolPresentationPolicy;
    resolveExpectedEntryFileName?(args: {
        seed: TopicSeed;
        exercise: ManifestCodeInput;
    }): string | undefined;
    allowedExerciseKinds: string[];
    allowedRecipeTypes: string[];
    buildModuleRuntimeDefaults(
        moduleOrder?: number,
        module?: PlannedModule,
    ): TopicSeed["moduleRuntimeDefaults"] | null;
    buildModuleServiceDefaults?(
        moduleOrder?: number,
        module?: PlannedModule,
    ): TopicSeed["moduleServiceDefaults"] | null;
    renderAuthoringPromptRules?(args: {
        seed: TopicSeed;
        shape: SubjectShapePack;
    }): string[];
    renderExerciseKindPromptRules?(args: {
        mode: ProfilePromptMode;
        seed: TopicSeed;
    }): string[];
    qualityPolicy?: {
        conceptOnly?: boolean;
        repeatedExerciseTextThreshold?: number;
    };
    codeInput?: CodeInputProfileCapability;
    practice?: PracticeProfileConfig;
    project?: ProjectProfileCapability;
    getRecipeRegistry(): Record<string, RecipeHandler>;
    validateTopicBundle(bundle: TopicBundleManifest): string[];
};

export type CourseProfileAdapter = ProfileAdapter;
