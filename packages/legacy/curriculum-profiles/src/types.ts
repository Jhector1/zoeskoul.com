import type {
    CourseProfileId,
    ManifestExercise,
    ManifestRuntimeDefaults,
    TopicBundleManifest,
    TopicPlanDraft,
} from "@zoeskoul/curriculum-contracts";

export type RecipeHandler<T = any> = (
    def: any,
    args: any,
    resolved: any,
) => any;

export type CourseProfile = {
    id: CourseProfileId;
    allowedExerciseKinds: Array<ManifestExercise["kind"]>;
    allowedRecipeTypes: string[];
    buildModuleRuntimeDefaults(modulePlan: any): ManifestRuntimeDefaults | null;
    getRecipeRegistry(): Record<string, RecipeHandler<any>>;
    validateTopicBundle(bundle: TopicBundleManifest): string[];

    buildTopicBundleFromPlan?: (args: {
        subjectSlug: string;
        moduleSlug: string;
        sectionSlug: string;
        prefix: string;
        topicPlan: TopicPlanDraft;
    }) => TopicBundleManifest;

    buildTopicMessagesFromPlan?: (args: {
        subjectSlug: string;
        moduleSlug: string;
        sectionSlug: string;
        prefix: string;
        topicPlan: TopicPlanDraft;
        locale: string;
    }) => Record<string, unknown>;
};