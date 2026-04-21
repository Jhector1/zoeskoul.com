import type {
    SqlTopicRecipe,
    TopicBundleManifest,
    TopicPlanDraft,
} from "@zoeskoul/curriculum-contracts";
import { inferSqlTopicRecipe } from "../recipes/inferSqlTopicRecipe.js";
import { buildSqlTopicBundleFromRecipe } from "./buildSqlTopicBundleFromRecipe.js";

export function buildSqlTopicBundleFromPlan(args: {
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    prefix: string;
    topicPlan: TopicPlanDraft;
}): TopicBundleManifest {
    const recipe: SqlTopicRecipe = inferSqlTopicRecipe(args.topicPlan);

    return buildSqlTopicBundleFromRecipe({
        subjectSlug: args.subjectSlug,
        moduleSlug: args.moduleSlug,
        sectionSlug: args.sectionSlug,
        prefix: args.prefix,
        recipe,
    });
}