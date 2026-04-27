import { z } from "zod";
import {
    type QuestionAnalyticsQuery,
    type QuestionAnalyticsResponse,
    type RawQuestionAnalyticsQuery,
    type StrugglingQuestionSnapshot,
} from "@zoeskoul/progress-contracts";
import { prisma } from "@zoeskoul/db";
import {
    firstParam,
    PROGRESS_RANGE_IDS,
    rangeStart,
    toIso,
} from "./shared";

const querySchema = z.object({
    range: z.preprocess(firstParam, z.enum(PROGRESS_RANGE_IDS)).catch("30d"),
    search: z.preprocess(firstParam, z.string().trim().max(120)).catch(""),
    limit: z
        .preprocess(firstParam, z.coerce.number().int().min(1).max(100))
        .catch(25),
    minAttempts: z
        .preprocess(firstParam, z.coerce.number().int().min(1).max(1000))
        .catch(3),
});

function getObjectValue(value: unknown, key: string) {
    if (!value || typeof value !== "object") return null;

    const record = value as Record<string, unknown>;
    const found = record[key];

    return typeof found === "string" && found.trim() ? found.trim() : null;
}

function getQuestionKey(payload: unknown, instanceId: string) {
    return (
        getObjectValue(payload, "analyticsKey") ??
        getObjectValue(payload, "exerciseKey") ??
        getObjectValue(payload, "questionKey") ??
        getObjectValue(payload, "id") ??
        instanceId
    );
}

function getAttemptActorKey(attempt: {
    id: string;
    userId: string | null;
    guestId: string | null;
    session: {
        userId: string | null;
        guestId: string | null;
    } | null;
}) {
    if (attempt.userId) return `user:${attempt.userId}`;
    if (attempt.session?.userId) return `user:${attempt.session.userId}`;
    if (attempt.guestId) return `guest:${attempt.guestId}`;
    if (attempt.session?.guestId) return `guest:${attempt.session.guestId}`;

    return `attempt:${attempt.id}`;
}

function calculateStuckScore(input: {
    attempts: number;
    wrongAttempts: number;
    revealUsed: number;
    uniqueLearners: number;
    successRate: number;
}) {
    const avgAttemptsPerLearner = input.uniqueLearners
        ? input.attempts / input.uniqueLearners
        : input.attempts;

    const repeatPenalty = Math.max(0, avgAttemptsPerLearner - 1) * 10;
    const wrongPenalty = input.wrongAttempts * 2;
    const revealPenalty = input.revealUsed * 4;
    const lowSuccessPenalty = (1 - input.successRate) * 25;

    return Math.round(
        wrongPenalty + revealPenalty + repeatPenalty + lowSuccessPenalty,
    );
}

export function normalizeQuestionAnalyticsQuery(
    input: RawQuestionAnalyticsQuery = {},
): Required<QuestionAnalyticsQuery> {
    return querySchema.parse(input);
}

export function searchParamsToQuestionAnalyticsQuery(
    searchParams: URLSearchParams,
): Required<QuestionAnalyticsQuery> {
    return normalizeQuestionAnalyticsQuery({
        range: searchParams.get("range") ?? undefined,
        search: searchParams.get("search") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
        minAttempts: searchParams.get("minAttempts") ?? undefined,
    });
}

export async function getQuestionAnalytics(
    input: RawQuestionAnalyticsQuery = {},
): Promise<QuestionAnalyticsResponse> {
    const query = normalizeQuestionAnalyticsQuery(input);
    const from = rangeStart(query.range);
    const searchLower = query.search.toLowerCase();

    const attempts = await prisma.practiceAttempt.findMany({
        where: {
            createdAt: { gte: from },
        },
        orderBy: {
            createdAt: "desc",
        },
        take: 20000,
        select: {
            id: true,
            userId: true,
            guestId: true,
            ok: true,
            revealUsed: true,
            createdAt: true,
            session: {
                select: {
                    userId: true,
                    guestId: true,
                },
            },
            instance: {
                select: {
                    id: true,
                    title: true,
                    prompt: true,
                    kind: true,
                    difficulty: true,
                    publicPayload: true,
                    topic: {
                        select: {
                            slug: true,
                            titleKey: true,
                            subject: {
                                select: {
                                    id: true,
                                    slug: true,
                                    title: true,
                                },
                            },
                            module: {
                                select: {
                                    id: true,
                                    slug: true,
                                    title: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    type QuestionBucket = {
        questionKey: string;
        instanceId: string;

        title: string;
        prompt: string;
        kind: string;
        difficulty: string;

        topicSlug: string | null;
        topicTitleKey: string | null;

        subjectId: string | null;
        subjectSlug: string | null;
        subjectTitle: string | null;

        moduleId: string | null;
        moduleSlug: string | null;
        moduleTitle: string | null;

        attempts: number;
        correctAttempts: number;
        wrongAttempts: number;
        revealUsed: number;

        learnerKeys: Set<string>;
        firstAttemptAt: Date | null;
        lastAttemptAt: Date | null;
    };

    const buckets = new Map<string, QuestionBucket>();

    for (const attempt of attempts) {
        const instance = attempt.instance;
        const topic = instance.topic;
        const questionKey = getQuestionKey(instance.publicPayload, instance.id);

        const bucket =
            buckets.get(questionKey) ??
            {
                questionKey,
                instanceId: instance.id,

                title: instance.title,
                prompt: instance.prompt,
                kind: String(instance.kind),
                difficulty: String(instance.difficulty),

                topicSlug: topic?.slug ?? null,
                topicTitleKey: topic?.titleKey ?? null,

                subjectId: topic?.subject?.id ?? null,
                subjectSlug: topic?.subject?.slug ?? null,
                subjectTitle: topic?.subject?.title ?? null,

                moduleId: topic?.module?.id ?? null,
                moduleSlug: topic?.module?.slug ?? null,
                moduleTitle: topic?.module?.title ?? null,

                attempts: 0,
                correctAttempts: 0,
                wrongAttempts: 0,
                revealUsed: 0,

                learnerKeys: new Set<string>(),
                firstAttemptAt: null,
                lastAttemptAt: null,
            };

        bucket.attempts += 1;

        if (attempt.ok) {
            bucket.correctAttempts += 1;
        } else {
            bucket.wrongAttempts += 1;
        }

        if (attempt.revealUsed) {
            bucket.revealUsed += 1;
        }

        bucket.learnerKeys.add(getAttemptActorKey(attempt));

        if (!bucket.firstAttemptAt || attempt.createdAt < bucket.firstAttemptAt) {
            bucket.firstAttemptAt = attempt.createdAt;
        }

        if (!bucket.lastAttemptAt || attempt.createdAt > bucket.lastAttemptAt) {
            bucket.lastAttemptAt = attempt.createdAt;
        }

        buckets.set(questionKey, bucket);
    }

    const questionsAll: StrugglingQuestionSnapshot[] = Array.from(
        buckets.values(),
    )
        .map((bucket) => {
            const successRate = bucket.attempts
                ? bucket.correctAttempts / bucket.attempts
                : 0;

            const uniqueLearners = bucket.learnerKeys.size;

            return {
                questionKey: bucket.questionKey,
                instanceId: bucket.instanceId,

                title: bucket.title,
                prompt: bucket.prompt,
                kind: bucket.kind,
                difficulty: bucket.difficulty,

                topicSlug: bucket.topicSlug,
                topicTitleKey: bucket.topicTitleKey,

                subjectId: bucket.subjectId,
                subjectSlug: bucket.subjectSlug,
                subjectTitle: bucket.subjectTitle,

                moduleId: bucket.moduleId,
                moduleSlug: bucket.moduleSlug,
                moduleTitle: bucket.moduleTitle,

                attempts: bucket.attempts,
                correctAttempts: bucket.correctAttempts,
                wrongAttempts: bucket.wrongAttempts,
                revealUsed: bucket.revealUsed,

                uniqueLearners,
                avgAttemptsPerLearner: uniqueLearners
                    ? bucket.attempts / uniqueLearners
                    : bucket.attempts,
                successRate,
                stuckScore: calculateStuckScore({
                    attempts: bucket.attempts,
                    wrongAttempts: bucket.wrongAttempts,
                    revealUsed: bucket.revealUsed,
                    uniqueLearners,
                    successRate,
                }),

                firstAttemptAt: toIso(bucket.firstAttemptAt),
                lastAttemptAt: toIso(bucket.lastAttemptAt),
            };
        })
        .filter((question) => question.attempts >= query.minAttempts)
        .filter((question) => {
            if (!searchLower) return true;

            return [
                question.title,
                question.prompt,
                question.kind,
                question.difficulty,
                question.topicSlug ?? "",
                question.subjectTitle ?? "",
                question.moduleTitle ?? "",
            ]
                .join(" ")
                .toLowerCase()
                .includes(searchLower);
        });

    const questions = questionsAll
        .sort((a, b) => {
            if (b.stuckScore !== a.stuckScore) return b.stuckScore - a.stuckScore;
            if (b.wrongAttempts !== a.wrongAttempts) {
                return b.wrongAttempts - a.wrongAttempts;
            }
            return b.attempts - a.attempts;
        })
        .slice(0, query.limit);

    const totalAttempts = questionsAll.reduce(
        (sum, question) => sum + question.attempts,
        0,
    );

    const totalCorrect = questionsAll.reduce(
        (sum, question) => sum + question.correctAttempts,
        0,
    );

    const totalWrongAttempts = questionsAll.reduce(
        (sum, question) => sum + question.wrongAttempts,
        0,
    );

    return {
        overview: {
            totalQuestions: questionsAll.length,
            totalAttempts,
            totalWrongAttempts,
            averageSuccessRate: totalAttempts ? totalCorrect / totalAttempts : 0,
            questionsNeedingReview: questionsAll.filter(
                (question) =>
                    question.attempts >= query.minAttempts &&
                    (question.successRate < 0.6 ||
                        question.avgAttemptsPerLearner >= 2 ||
                        question.revealUsed > 0),
            ).length,
        },
        questions,
        meta: {
            range: query.range,
            search: query.search,
            limit: query.limit,
            minAttempts: query.minAttempts,
            generatedAt: new Date().toISOString(),
        },
    };
}
