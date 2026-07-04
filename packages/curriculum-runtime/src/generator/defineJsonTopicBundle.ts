import { defineTopicBundle } from "../topic/defineTopicBundle.js";
import { buildReviewFromManifest } from "../review/buildReviewFromManifest.js";
import { buildSketchesFromManifest } from "../sketches/buildSketchesFromManifest.js";

function normalizeRuntimePurpose(value: unknown, kind?: unknown, fallback?: "quiz" | "project") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "quiz") return "quiz";
  if (raw === "project" || raw === "try_it" || raw === "try-it" || raw === "practice" || raw === "capstone") return "project";
  if (!raw) {
    if (String(kind ?? "").trim() === "code_input") return "project";
    return fallback ?? "quiz";
  }
  return fallback ?? "quiz";
}

function defineJsonGeneratorTopic(manifest: any, profileId: string) {
  const pool = manifest.exercises.map((exercise: any) => ({
    key: exercise.id,
    w: exercise.weight ?? 1,
    kind: exercise.kind,
    purpose: normalizeRuntimePurpose(exercise.purpose, exercise.kind, exercise.kind === "code_input" ? "project" : "quiz"),
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
