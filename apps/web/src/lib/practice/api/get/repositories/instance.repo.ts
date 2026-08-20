import type { PrismaClient } from "@/lib/prisma";
import {
    PracticeDifficulty as DbPracticeDifficulty,
    PracticeKind,
    PracticePurpose,
} from "@zoeskoul/db";

import { toDbTopicSlug } from "@/lib/practice/topicSlugs";
import { selfPacedPracticeExperienceItemKey } from "@/lib/practice/experience/authoredPracticeQueue";
import type { Difficulty, Exercise, TopicSlug } from "@/lib/practice/types";

import {
    toDbDifficultyOrThrow,
    toPracticeKindOrThrow,
} from "../../shared/prismaMappers";
import { normalizeExpectedForSave } from "../mappers/normalizeExpected.mapper";
import { buildExpectedAnswerPayload } from "../mappers/expectedAnswerPayload.mapper";

export function toDbPurpose(
    purpose?: "quiz" | "project" | "practice" | PracticePurpose | null,
) {
    if (purpose === "practice") return PracticePurpose.practice;
    if (purpose === "project") return PracticePurpose.project;
    return PracticePurpose.quiz;
}

export function buildPracticeExperienceItemKey(args: {
    sessionId: string | null;
    sessionMode?: string | null;
    answeredCount?: number | null;
    ownerUserId?: string | null;
    ownerModuleSlug?: string | null;
    purpose?: PracticePurpose | null;
    topicSlug: string;
    exerciseKey: string | null;
}) {
    if (!args.exerciseKey) return null;

    if (
        !args.sessionId &&
        args.ownerUserId &&
        args.ownerModuleSlug &&
        args.purpose === PracticePurpose.practice
    ) {
        return selfPacedPracticeExperienceItemKey({
            userId: args.ownerUserId,
            moduleSlug: args.ownerModuleSlug,
            topicSlug: args.topicSlug,
            exerciseKey: args.exerciseKey,
        });
    }

    if (!args.sessionId) return null;

    if (args.sessionMode === "daily_five") {
        return `daily-five:${args.sessionId}:${args.topicSlug}:${args.exerciseKey}`;
    }

    if (args.sessionMode) {
        return `practice-session:${args.sessionId}:slot:${Math.max(0, Number(args.answeredCount ?? 0))}`;
    }

    return null;
}

export async function createPracticeInstance(args: {
    prisma: PrismaClient;
    sessionId: string | null;
    sessionMode?: string | null;
    ownerUserId?: string | null;
    ownerModuleSlug?: string | null;
    exercise: Exercise;
    expected: unknown;
    topicSlug: TopicSlug;
    difficulty: Difficulty;
    topicIdHint?: string | null;
    purpose?: "quiz" | "project" | PracticePurpose | null;
}) {
    const {
        prisma,
        sessionId,
        sessionMode,
        ownerUserId,
        ownerModuleSlug,
        exercise,
        expected,
        topicSlug,
        difficulty,
        topicIdHint,
        purpose,
    } = args;

    const difficultyValue = ((exercise as any).difficulty ?? difficulty) as Difficulty;
    const dbDifficulty: DbPracticeDifficulty = toDbDifficultyOrThrow(difficultyValue);

    const dbTopicSlug = toDbTopicSlug(String(topicSlug)) as TopicSlug;

    let topicId: string;
    if (typeof topicIdHint === "string" && topicIdHint.trim()) {
        topicId = topicIdHint.trim();
    } else {
        const topic = await prisma.practiceTopic.findUnique({
            where: { slug: dbTopicSlug },
            select: { id: true },
        });

        if (!topic) {
            throw new Error(`Topic slug "${dbTopicSlug}" not found in DB.`);
        }

        topicId = topic.id;
    }

    const kindEnum: PracticeKind = toPracticeKindOrThrow((exercise as any)?.kind);
    const expectedCanon = normalizeExpectedForSave(kindEnum, expected);

    if (expectedCanon?.kind && String(expectedCanon.kind) !== String(kindEnum)) {
        throw new Error(`Expected.kind "${expectedCanon.kind}" != instance kind "${kindEnum}".`);
    }

    /**
     * PracticeQuestionInstance.publicPayload snapshots the resolved exercise for
     * validation/runtime APIs, but authored project content must still be
     * re-resolved from the current compiled topic bundle on each fresh load.
     * Persisted learner progress must never be treated as the source of truth
     * for authored contract fields.
     */
    const publicPayload = {
        ...(exercise as any),
        topic: dbTopicSlug,
    } as any;

    if (kindEnum === PracticeKind.matrix_input) {
        const values = expectedCanon?.values as number[][];
        publicPayload.rows ??= values.length;
        publicPayload.cols ??= values[0]?.length ?? 0;
    }

    const expectedAnswerPayload = buildExpectedAnswerPayload(kindEnum, expectedCanon);

    const explanation =
        typeof (expected as any)?.explanation === "string"
            ? (expected as any).explanation
            : typeof (expected as any)?.rationale === "string"
                ? (expected as any).rationale
                : null;

    const dbPurpose = toDbPurpose(purpose);
    publicPayload.purpose = String(dbPurpose);

    const exerciseKeyRaw =
        (exercise as any).exerciseKey ?? (exercise as any).id ?? null;
    const exerciseKey =
        typeof exerciseKeyRaw === "string" && exerciseKeyRaw.trim()
            ? exerciseKeyRaw.trim()
            : null;
    const answeredCount =
        sessionId && sessionMode && sessionMode !== "daily_five"
            ? await prisma.practiceQuestionInstance.count({
                where: { sessionId, answeredAt: { not: null } },
            })
            : null;
    const experienceItemKey = buildPracticeExperienceItemKey({
        sessionId,
        sessionMode,
        answeredCount,
        ownerUserId,
        ownerModuleSlug,
        purpose: dbPurpose,
        topicSlug: String(dbTopicSlug),
        exerciseKey,
    });

    const data = {
        sessionId,
        exerciseKey,
        experienceItemKey,
        kind: kindEnum,
        topicId,
        difficulty: dbDifficulty,
        purpose: dbPurpose,
        title: String((exercise as any).title ?? "Practice"),
        prompt: String((exercise as any).prompt ?? ""),
        publicPayload,
        secretPayload: {
            expected: expectedCanon,
            expectedAnswerPayload,
            explanation,
        },
    };

    if (experienceItemKey) {
        const canonicalSelfPaced =
            !sessionId &&
            Boolean(ownerUserId) &&
            Boolean(ownerModuleSlug) &&
            dbPurpose === PracticePurpose.practice;
        return prisma.practiceQuestionInstance.upsert({
            where: { experienceItemKey },
            // Canonical self-paced rows survive across entry origins/runs, so
            // refresh authored runtime payloads without clearing answeredAt.
            update: canonicalSelfPaced ? data : {},
            create: data,
            select: { id: true, sessionId: true, publicPayload: true },
        });
    }

    return prisma.practiceQuestionInstance.create({
        data,
        select: { id: true, sessionId: true, publicPayload: true },
    });
}
