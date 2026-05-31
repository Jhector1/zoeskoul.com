import type {
    TopicBundleManifest,
} from "./manifestTypes";
import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";
import type {
    Difficulty,
    ReviewEmbeddedTryIt,
    ReviewProjectSpec,
    ReviewTopicShape,
    SeedPolicy,
} from "@/lib/subjects/types";
import type { PracticeKind } from "@zoeskoul/db";
import { buildReviewFromManifestCore } from "@zoeskoul/curriculum-runtime/review";
import { makeTopicDef } from "@/lib/subjects/_core/topicMeta";
import { tag } from "@/lib/practice/generator/shared/i18n";

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;
}

function asString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

export function buildReviewFromManifest(args: {
    manifest: TopicBundleManifest;
    pool: readonly { key: string; w: number; kind?: any; purpose?: any }[];
}) {
    const built = buildReviewFromManifestCore({
        manifest: args.manifest,
        pool: args.pool,
        tag: (key) => tag(key) as any,
        makeTopicDef: (input) => makeTopicDef(input as any),
    }) as {
        topic: ReviewTopicShape;
        def: TopicDefInput;
    };

    const rawCards = Array.isArray(args.manifest.cards) ? args.manifest.cards : [];
    const topicSlug = `${args.manifest.prefix}.${args.manifest.topicId}`;

    const cards = built.topic.cards.map((card, index) => {
        const rawCard =
            asRecord(rawCards[index]) ??
            asRecord(
                rawCards.find((candidate) => {
                    const candidateRecord = asRecord(candidate);
                    return candidateRecord?.id === card.id;
                }),
            );
        if (!rawCard) return card;
        if (card.type !== "text" && card.type !== "sketch") return card;

        const rawTryIt = asRecord(rawCard.tryIt);
        if (!rawTryIt) return card;

        const tryItId = asString(rawTryIt.id);
        const exerciseKey = asString(rawTryIt.exerciseKey);
        if (!tryItId || !exerciseKey) return card;

        const titleKey = asString(rawTryIt.titleKey);
        const promptKey = asString(rawTryIt.promptKey);
        const title = titleKey ? tag(titleKey) : undefined;
        const prompt = promptKey ? tag(promptKey) : undefined;

        const difficulty = (asString(rawTryIt.difficulty) || "easy") as Difficulty;
        const preferKind = (asString(rawTryIt.preferKind) || "code_input") as PracticeKind;
        const seedPolicy = (asString(rawTryIt.seedPolicy) || "global") as SeedPolicy;
        const maxAttempts = typeof rawTryIt.maxAttempts === "number"
            ? rawTryIt.maxAttempts
            : rawTryIt.maxAttempts === null
                ? null
                : null;

        const spec: ReviewProjectSpec = {
            mode: "project",
            subject: args.manifest.subjectSlug,
            moduleSlug: args.manifest.moduleSlug,
            section: args.manifest.sectionSlug,
            topic: topicSlug,
            difficulty,
            preferKind,
            allowReveal: true,
            maxAttempts,
            steps: [
                {
                    id: tryItId.replace(/-/g, "_"),
                    title,
                    exerciseKey,
                    difficulty,
                    preferKind,
                    seedPolicy,
                    maxAttempts,
                },
            ],
            runtime: args.manifest.runtimeDefaults ?? null,
            tryIt: true,
            uiKind: "try_it",
            displayKind: "try_it",
        };

        const tryIt: ReviewEmbeddedTryIt = {
            id: tryItId,
            title,
            prompt,
            exerciseKey,
            difficulty,
            preferKind,
            seedPolicy,
            required: rawTryIt.required !== false,
            allowReveal: true,
            maxAttempts: maxAttempts ?? undefined,
            spec,
        };

        return {
            ...card,
            tryIt,
        };
    });

    return {
        ...built,
        topic: {
            ...built.topic,
            cards,
        },
    };
}
