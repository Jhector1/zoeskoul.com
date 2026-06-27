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

function asOptionalBoolean(value: unknown) {
    return typeof value === "boolean" ? value : undefined;
}

function asToolsSpec(value: unknown) {
    const tools = asRecord(value);
    if (!tools) return null;

    const defaultVisible = asOptionalBoolean(tools.defaultVisible);
    const allowOpen = asOptionalBoolean(tools.allowOpen);
    if (defaultVisible === undefined && allowOpen === undefined) return null;

    return {
        ...(defaultVisible !== undefined ? { defaultVisible } : {}),
        ...(allowOpen !== undefined ? { allowOpen } : {}),
    };
}

const TRY_IT_EXERCISE_STEP_FIELDS = [
    "kind",
    "purpose",
    "language",
    "lang",
    "starterCode",
    "starterFiles",
    "workspace",
    "files",
    "initialFiles",
    "workspaceFiles",
    "fixtureFiles",
    "fixtures",
    "fileFixtures",
    "runtime",
    "recipe",
    "ideConfig",
    "solutionCode",
    "solutionFiles",
    "tests",
    "expected",
    "messageBase",
    "datasetId",
    "sqlDatasetId",
    "fixedSqlDialect",
    "sqlDialect",
    "sqlSchemaSql",
    "sqlSeedSql",
    "sqlInitialTableSnapshots",
] as const;

function pickExerciseStepFields(exercise: Record<string, unknown> | null) {
    if (!exercise) return {};

    const picked: Record<string, unknown> = {};
    for (const key of TRY_IT_EXERCISE_STEP_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(exercise, key)) {
            const value = exercise[key];
            if (value !== undefined) {
                picked[key] = value;
            }
        }
    }

    return picked;
}

function findExerciseManifestByKey(
    manifest: TopicBundleManifest,
    exerciseKey: string,
) {
    const exercises = Array.isArray(manifest.exercises) ? manifest.exercises : [];
    for (const exercise of exercises) {
        const record = asRecord(exercise);
        if (!record) continue;

        const id = asString(record.id);
        const key = asString(record.exerciseKey);
        const exerciseId = asString(record.exerciseId);
        const stableId = asString(record.stableExerciseId);
        if (id === exerciseKey || key === exerciseKey || exerciseId === exerciseKey || stableId === exerciseKey) {
            return record;
        }
    }

    return null;
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

        const rawToolsSpec = asToolsSpec(rawCard.tools);
        const cardWithTools = rawToolsSpec
            ? {
                ...card,
                tools: rawToolsSpec,
            }
            : card;

        if (cardWithTools.type !== "text" && cardWithTools.type !== "sketch") {
            return cardWithTools;
        }

        const rawTryIt = asRecord(rawCard.tryIt);
        if (!rawTryIt) return cardWithTools;

        const tryItId = asString(rawTryIt.id);
        const exerciseKey = asString(rawTryIt.exerciseKey);
        if (!tryItId || !exerciseKey) return cardWithTools;

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

        const authoredExercise = findExerciseManifestByKey(args.manifest, exerciseKey);
        const authoredExerciseStepFields = pickExerciseStepFields(authoredExercise);

        const tryItStep = {
            ...authoredExerciseStepFields,
            id: tryItId.replace(/-/g, "_"),
            title,
            exerciseKey,
            difficulty,
            preferKind,
            seedPolicy,
            maxAttempts,
        };

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
            steps: [tryItStep as any],
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
            ...cardWithTools,
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
