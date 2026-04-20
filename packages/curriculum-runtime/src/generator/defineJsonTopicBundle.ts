import type { ManifestRuntimeDefaults } from "@zoeskoul/curriculum-contracts";

export type JsonObject = { readonly [key: string]: unknown };

export type TopicPoolItem = {
    key: string;
    w: number;
    kind?: string;
    purpose?: "quiz" | "project";
};

export type TopicMeta = {
    label: string;
    minutes: number;
    preferKind?: string | null;
    pool?: readonly TopicPoolItem[];
    runtimeDefaults?: ManifestRuntimeDefaults | null;
};

export type TopicDefInput = {
    id: string;
    order?: number;
    variant?: string | null;
    titleKey?: string;
    description?: string | null;
    meta: TopicMeta;
};

export type SubjectTopicBundle = {
    def: TopicDefInput;
    review?: unknown;
    sketches?: Record<string, unknown>;
    generator?: unknown;
    locale?: JsonObject;
};

export type GeneratedSubjectTopicBundle = SubjectTopicBundle & {
    generator: unknown;
};

export function defineTopicBundle<T extends SubjectTopicBundle>(input: T): T {
    return input;
}




import { buildReviewFromManifest } from "../review/buildReviewFromManifest.js";
import { buildSketchesFromManifest } from "../sketches/buildSketchesFromManifest.js";

export function defineJsonTopicBundle(
    manifest: any,
    profileId: string,
): GeneratedSubjectTopicBundle {
    const generatorTopic = {
        id: manifest.topicId,
        pool: manifest.exercises.map((ex: any) => ({
            key: ex.id,
            w: ex.weight ?? 1,
            kind: ex.kind,
            purpose: ex.purpose,
        })),
        manifest,
        profileId,
    };

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