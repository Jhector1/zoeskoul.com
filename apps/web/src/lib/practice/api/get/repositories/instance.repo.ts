import type { PrismaClient } from "@prisma/client";
import {
    PracticeDifficulty as DbPracticeDifficulty,
    PracticeKind,
    PracticePurpose,
} from "@prisma/client";

import { toDbTopicSlug } from "@/lib/practice/topicSlugs";
import type { Difficulty, Exercise, TopicSlug } from "@/lib/practice/types";

import {
    toDbDifficultyOrThrow,
    toPracticeKindOrThrow,
} from "../../shared/prismaMappers";
import { normalizeExpectedForSave } from "../mappers/normalizeExpected.mapper";
import { buildExpectedAnswerPayload } from "../mappers/expectedAnswerPayload.mapper";

function toDbPurpose(purpose?: "quiz" | "project" | PracticePurpose | null) {
    return purpose === "project" ? PracticePurpose.project : PracticePurpose.quiz;
}

export async function createPracticeInstance(args: {
    prisma: PrismaClient;
    sessionId: string | null;
    exercise: Exercise;
    expected: any;
    topicSlug: TopicSlug;
    difficulty: Difficulty;
    topicIdHint?: string | null;
    purpose?: "quiz" | "project" | PracticePurpose | null;
}) {
    const {
        prisma,
        sessionId,
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
        typeof expected?.explanation === "string"
            ? expected.explanation
            : typeof expected?.rationale === "string"
                ? expected.rationale
                : null;

    const dbPurpose = toDbPurpose(purpose);
    publicPayload.purpose = String(dbPurpose);

    return prisma.practiceQuestionInstance.create({
        data: {
            sessionId,
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
        },
        select: { id: true, sessionId: true },
    });
}