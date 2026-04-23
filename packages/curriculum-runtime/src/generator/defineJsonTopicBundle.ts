import { defineTopicBundle } from "../topic/defineTopicBundle.js";
import { buildReviewFromManifest } from "../review/buildReviewFromManifest.js";
import { buildSketchesFromManifest } from "../sketches/buildSketchesFromManifest.js";

function defineJsonGeneratorTopic(manifest: any, profileId: string) {
  const pool = manifest.exercises.map((exercise: any) => ({
    key: exercise.id,
    w: exercise.weight ?? 1,
    kind: exercise.kind,
    purpose: exercise.purpose ?? "quiz",
  }));

  return {
    id: `${manifest.prefix}.${manifest.topicId}`,
    profileId,
    pool,
  };
}

export function defineJsonTopicBundle(manifest: any, profileId: string) {
  const generatorTopic = defineJsonGeneratorTopic(manifest, profileId);

  const review = buildReviewFromManifest({
    manifest,
    pool: generatorTopic.pool,
  });

  const sketches = buildSketchesFromManifest(manifest);

  return defineTopicBundle({
    def: review.def,
    review: review.topic,
    sketches,
    generator: generatorTopic,
  });
}
