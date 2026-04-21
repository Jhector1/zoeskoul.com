import type {
    SqlTopicRecipe,
    TopicPlanDraft,
} from "@zoeskoul/curriculum-contracts";
import { inferSqlTopicRecipe } from "../recipes/inferSqlTopicRecipe.js";
import { buildSqlTopicMessagesFromRecipe } from "./buildSqlTopicMessagesFromRecipe.js";

export function buildSqlTopicMessagesFromPlan(args: {
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    prefix: string;
    topicPlan: TopicPlanDraft;
    locale: string;
}): Record<string, unknown> {
    const recipe: SqlTopicRecipe = inferSqlTopicRecipe(args.topicPlan);

    return buildSqlTopicMessagesFromRecipe({
        subjectSlug: args.subjectSlug,
        moduleSlug: args.moduleSlug,
        sectionSlug: args.sectionSlug,
        prefix: args.prefix,
        recipe,
        locale: args.locale,
    });
}