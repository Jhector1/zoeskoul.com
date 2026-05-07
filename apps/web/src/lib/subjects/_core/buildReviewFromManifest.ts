import type {
    ManifestCard,
    ManifestProjectStep,
    TopicBundleManifest,
} from "./manifestTypes";
import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";
import type { ReviewTopicShape } from "@/lib/subjects/types";
import {
    makeQuizCard,
    makeQuizSpec,
    makeSketchCard,
    makeProjectCard,
    makeProjectSpec,
    makeProjectStep,
} from "@/lib/subjects/_core/reviewBuilders";
import { makeTopicDef } from "@/lib/subjects/_core/topicMeta";
import { tag } from "@/lib/practice/generator/shared/i18n";

export function buildReviewFromManifest(args: {
    manifest: TopicBundleManifest;
    pool: readonly { key: string; w: number; kind?: any; purpose?: any }[];
}) {
    const { manifest, pool } = args;
    const topicSlug = `${manifest.prefix}.${manifest.topicId}`;

    const topic = {
        id: manifest.topicId,
        label: tag(manifest.topic.labelKey) as any,
        minutes: manifest.minutes,
        summary: tag(manifest.topic.summaryKey) as any,
        meta: {
            runtimeDefaults: manifest.runtimeDefaults ?? null,
            serviceDefaults: manifest.serviceDefaults ?? null,
        },
        cards: manifest.cards.map((card: ManifestCard, index: number) => {
            if (card.kind === "sketch") {
                const sketchManifest = manifest.sketches.find(
                    (sketch) => sketch.id === card.sketchId,
                );

                return makeSketchCard({
                    topicId: manifest.topicId,
                    index,
                    title: tag(card.titleKey) as any,
                    sketchId: `${manifest.subjectSlug}.${manifest.moduleSlug}.${manifest.topicId}.${card.sketchId}`,
                    height: card.height ?? 520,
                    spec: {
                        runtime: sketchManifest?.runtime ?? null,
                        workspace: sketchManifest?.workspace ?? null,
                    },
                });
            }

            if (card.kind === "quiz") {
                return makeQuizCard({
                    topicId: manifest.topicId,
                    index,
                    title: tag(card.titleKey) as any,
                    spec: makeQuizSpec({
                        subject: manifest.subjectSlug,
                        module: manifest.moduleSlug,
                        section: manifest.sectionSlug,
                        topic: topicSlug,
                        difficulty: card.quiz.difficulty,
                        n: card.quiz.n,
                        allowReveal: card.quiz.allowReveal ?? true,
                        preferKind: card.quiz.preferKind ?? null,
                        maxAttempts: card.quiz.maxAttempts ?? 10,
                        runtime: manifest.runtimeDefaults ?? null,
                    }),
                });
            }

            if (card.kind === "project") {
                return makeProjectCard({
                    topicId: manifest.topicId,
                    index,
                    title: tag(card.titleKey) as any,
                    spec: makeProjectSpec({
                        subject: manifest.subjectSlug,
                        module: manifest.moduleSlug,
                        section: manifest.sectionSlug,
                        topic: topicSlug,
                        difficulty: card.project.difficulty,
                        allowReveal: card.project.allowReveal ?? true,
                        preferKind: card.project.preferKind ?? null,
                        maxAttempts: card.project.maxAttempts ?? 10,
                        runtime: manifest.runtimeDefaults ?? null,
                        steps: card.project.steps.map((step: ManifestProjectStep) =>
                            makeProjectStep({
                                id: step.id,
                                title: tag(step.titleKey),
                                topic: topicSlug,
                                difficulty: step.difficulty ?? card.project.difficulty,
                                preferKind: step.preferKind ?? card.project.preferKind ?? null,
                                exerciseKey: step.exerciseKey,
                                seedPolicy:
                                    step.seedPolicy === "step"
                                        ? "actor"
                                        : (step.seedPolicy ?? "global"),
                                maxAttempts: step.maxAttempts ?? card.project.maxAttempts ?? 10,
                            }),
                        ),
                    }),
                });
            }

            throw new Error(`Unsupported card kind: ${(card as any).kind}`);
        }),
    } satisfies ReviewTopicShape;

    const baseDef = makeTopicDef({
        id: manifest.topicId,
        label: tag(manifest.topic.labelKey) as any,
        minutes: manifest.minutes,
        pool,
    }) satisfies TopicDefInput;

    const def: TopicDefInput = {
        ...baseDef,
        meta: {
            ...(baseDef.meta ?? {}),
            runtimeDefaults: manifest.runtimeDefaults ?? null,
            serviceDefaults: manifest.serviceDefaults ?? null,
        },
    };

    return { topic, def };
}
