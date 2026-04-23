import type {
    PlannedModule,
    ProfileAdapter,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";

export type RecipeResolvedArgs = {
    title: string;
    prompt: string;
    hint?: string;
    starterCode: string;
    help?: unknown;
    expectedExampleMeta?: string;
    maybeT?: (key: string) => string | undefined;
};

export type RecipeHandler<TDef = unknown, TArgs = unknown, TResult = unknown> = (
    def: TDef,
    args: TArgs,
    resolved: RecipeResolvedArgs,
) => TResult;

export type CourseProfile = {
    id: string;
    allowedExerciseKinds: string[];
    allowedRecipeTypes: string[];
    buildModuleRuntimeDefaults(
        moduleOrder?: number,
        module?: PlannedModule,
    ): TopicSeed["moduleRuntimeDefaults"] | null;
    getRecipeRegistry(): Record<string, RecipeHandler>;
    validateTopicBundle(bundle: TopicBundleManifest): string[];
};

export type CourseProfileAdapter = ProfileAdapter;