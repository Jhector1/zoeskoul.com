import type {
    ManifestCodeInput,
    ManifestRuntimeDefaults,
    PlannedModule,
    ProfileAdapter,
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
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
    allowedExerciseKinds: string[];
    allowedRecipeTypes: string[];
    buildModuleRuntimeDefaults(
        moduleOrder?: number,
        module?: PlannedModule,
    ): TopicSeed["moduleRuntimeDefaults"] | null;
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
    getRecipeRegistry(): Record<string, RecipeHandler>;
    validateTopicBundle(bundle: TopicBundleManifest): string[];
};

export type CourseProfileAdapter = ProfileAdapter;
