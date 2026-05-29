import {
    makeProjectCard,
    makeProjectSpec,
    makeProjectStep,
    makeQuizCard,
    makeQuizSpec,
    makeSketchCard,
} from "./reviewBuilders.js";

type PoolItem = {
    key: string;
    w: number;
    kind?: unknown;
    purpose?: unknown;
};

type TagFn = (key: string) => string;
type MakeTopicDefFn = (args: {
    id: string;
    label: string;
    minutes: number;
    pool: readonly PoolItem[];
    variant?: string | null;
    titleKey?: string;
    description?: string | null;
}) => any;

function normalizeString(value: unknown) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isTrueLike(value: unknown) {
    const normalized = normalizeString(value);
    return value === true || normalized === "true";
}

function hasTryItId(value: unknown) {
    const normalized = normalizeString(value);
    if (!normalized) return false;

    return (
        normalized.startsWith("try-") ||
        normalized.startsWith("try_") ||
        normalized.includes("-try-")
    );
}

function inheritMaxAttempts(
    value: number | null | undefined,
    parent: number | null | undefined,
): number | null | undefined {
    if (value !== undefined) return value;
    return parent;
}

export function buildReviewFromManifestCore(args: {
    manifest: any;
    pool: readonly PoolItem[];
    tag: TagFn;
    makeTopicDef: MakeTopicDefFn;
}) {
    const { manifest, pool, tag, makeTopicDef } = args;
    const topicSlug = `${manifest.prefix}.${manifest.topicId}`;

    const topic = {
        id: manifest.topicId,
        label: tag(manifest.topic.labelKey),
        minutes: manifest.minutes,
        summary: tag(manifest.topic.summaryKey),
        meta: {
            runtimeDefaults: manifest.runtimeDefaults ?? null,
            serviceDefaults: manifest.serviceDefaults ?? null,
        },
        cards: manifest.cards.map((card: any, index: number) => {
            if (card.kind === "sketch") {
                const sketchManifest = manifest.sketches?.find(
                    (sketch: any) => sketch.id === card.sketchId,
                );

                return makeSketchCard({
                    topicId: manifest.topicId,
                    index,
                    title: tag(card.titleKey),
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
                    title: tag(card.titleKey),
                    spec: makeQuizSpec({
                        subject: manifest.subjectSlug,
                        module: manifest.moduleSlug,
                        section: manifest.sectionSlug,
                        topic: topicSlug,
                        difficulty: card.quiz.difficulty,
                        n: card.quiz.n,
                        min: card.quiz.min,
                        max: card.quiz.max,
                        selectionMode: card.quiz.selectionMode,
                        allowReveal: card.quiz.allowReveal ?? true,
                        preferKind: card.quiz.preferKind ?? null,
                        maxAttempts: card.quiz.maxAttempts,
                        runtime: manifest.runtimeDefaults ?? null,
                    }),
                });
            }

            if (card.kind === "project") {
                const shouldUseAuthoredTryId = hasTryItId(card.id);
                const projectTryIt = isTrueLike(card.project.tryIt);
                const cardTryIt = isTrueLike(card.tryIt);
                const displayKind = typeof card.project.displayKind === "string"
                    ? card.project.displayKind
                    : undefined;
                const uiKind = typeof card.project.uiKind === "string"
                    ? card.project.uiKind
                    : undefined;

                return makeProjectCard({
                    topicId: manifest.topicId,
                    index,
                    id: shouldUseAuthoredTryId ? String(card.id).trim() : undefined,
                    title: tag(card.titleKey),
                    tryIt: cardTryIt || projectTryIt || undefined,
                    spec: makeProjectSpec({
                        subject: manifest.subjectSlug,
                        module: manifest.moduleSlug,
                        section: manifest.sectionSlug,
                        topic: topicSlug,
                        difficulty: card.project.difficulty,
                        allowReveal: card.project.allowReveal ?? true,
                        preferKind: card.project.preferKind ?? null,
                        maxAttempts: card.project.maxAttempts,
                        runtime: manifest.runtimeDefaults ?? null,
                        tryIt: projectTryIt || undefined,
                        displayKind,
                        uiKind,
                        steps: card.project.steps.map((step: any) =>
                            makeProjectStep({
                                id: step.id,
                                title: tag(step.titleKey),
                                topic: topicSlug,
                                difficulty: step.difficulty ?? card.project.difficulty,
                                preferKind:
                                    step.preferKind ?? card.project.preferKind ?? null,
                                exerciseKey: step.exerciseKey,
                                seedPolicy:
                                    step.seedPolicy === "step"
                                        ? "actor"
                                        : (step.seedPolicy ?? "global"),
                                maxAttempts: inheritMaxAttempts(
                                    step.maxAttempts,
                                    card.project.maxAttempts,
                                ),
                            }),
                        ),
                    }),
                });
            }

            throw new Error(`Unsupported card kind: ${String(card?.kind)}`);
        }),
    };

    const baseDef = makeTopicDef({
        id: manifest.topicId,
        label: tag(manifest.topic.labelKey),
        minutes: manifest.minutes,
        pool,
    });

    const def = {
        ...baseDef,
        meta: {
            ...(baseDef.meta ?? {}),
            runtimeDefaults: manifest.runtimeDefaults ?? null,
            serviceDefaults: manifest.serviceDefaults ?? null,
        },
    };

    return { topic, def };
}
