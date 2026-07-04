import type { TopicBundle, AnyHandler, PoolItem } from "@/lib/practice/generator/engines/utils";
import { normalizePracticePurpose } from "@/lib/practice/generator/engines/utils";
import type { TopicBundleManifest } from "@/lib/subjects/_core/manifestTypes";
import { buildExerciseFromManifest } from "./buildExerciseFromManifest";

export function defineJsonGeneratorTopic(manifest: TopicBundleManifest): TopicBundle {
    const topicSlug = `${manifest.prefix}.${manifest.topicId}`;

    const pool: PoolItem[] = manifest.exercises.map((ex) => ({
        key: ex.id,
        w: ex.weight ?? 1,
        kind: ex.kind,
        purpose: normalizePracticePurpose(ex.purpose, ex.kind, ex.kind === "code_input" ? "project" : "quiz") ?? "quiz",
    }));

    const handlers: Record<string, AnyHandler> = Object.fromEntries(
        manifest.exercises.map((ex) => [
            ex.id,
            (args) =>
                buildExerciseFromManifest(ex, args, {
                    serviceDefaults: manifest.serviceDefaults ?? null,
                    runtimeDefaults: manifest.runtimeDefaults ?? null,
                }),
        ]),
    );

    return {
        slug: topicSlug,
        pool,
        handlers,
    };
}
