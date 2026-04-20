import type {
    CourseProfileId,
    ManifestRuntimeDefaults,
    PlannedModule,
    TopicBundleManifest,
} from "@zoeskoul/curriculum-contracts";

export type RecipeHandler<T = any> = (
    def: any,
    args: any,
    resolved: {
        title: string;
        prompt: string;
        hint?: string;
        starterCode: string;
        help?: any;
        expectedExampleMeta?: string;
        maybeT?: (key: string) => string | undefined;
    },
) => any;

export type CourseProfile = {
    id: CourseProfileId;
    allowedExerciseKinds: string[];
    allowedRecipeTypes: string[];
    buildModuleRuntimeDefaults(module: PlannedModule): ManifestRuntimeDefaults | null;
    getRecipeRegistry(): Record<string, RecipeHandler<any>>;
    validateTopicBundle(bundle: TopicBundleManifest): string[];
};