import type {
    TopicBundleManifest,
} from "./manifestTypes";
import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";
import type { ReviewTopicShape } from "@/lib/subjects/types";
import { buildReviewFromManifestCore } from "@zoeskoul/curriculum-runtime/review";
import { makeTopicDef } from "@/lib/subjects/_core/topicMeta";
import { tag } from "@/lib/practice/generator/shared/i18n";

export function buildReviewFromManifest(args: {
    manifest: TopicBundleManifest;
    pool: readonly { key: string; w: number; kind?: any; purpose?: any }[];
}) {
    return buildReviewFromManifestCore({
        manifest: args.manifest,
        pool: args.pool,
        tag: (key) => tag(key) as any,
        makeTopicDef: (input) => makeTopicDef(input as any),
    }) as {
        topic: ReviewTopicShape;
        def: TopicDefInput;
    };
}