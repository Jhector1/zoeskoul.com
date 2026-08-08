import { defineGeneratedTopicBundle, type GeneratedSubjectTopicBundle } from "./defineTopicBundle";
import type { TopicBundleManifest } from "@zoeskoul/curriculum-contracts";
import { defineJsonGeneratorTopic } from "../generator/defineJsonTopicBundle";
import { buildReviewFromManifest } from "./buildReviewFromManifest";
import { buildSketchesFromManifest } from "./buildSketchesFromManifest";

export function defineJsonTopicBundle(
    manifest: TopicBundleManifest,
): GeneratedSubjectTopicBundle {
    const generatorTopic = defineJsonGeneratorTopic(manifest);

    const review = buildReviewFromManifest({
        manifest,
        pool: generatorTopic.pool,
    });

    const sketches = buildSketchesFromManifest(manifest);

    return defineGeneratedTopicBundle({
        def: review.def,
        review: review.topic,
        sketches,
        generator: generatorTopic,
    });
}
