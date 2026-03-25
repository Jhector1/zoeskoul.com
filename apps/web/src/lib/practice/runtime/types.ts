import type { Difficulty, Exercise } from "@/lib/practice/types";
import type { QItem } from "@/lib/practice/uiTypes";

export type PracticeItemState = {
    loading: boolean;
    error: string | null;
    busy: boolean;
    exercise: Exercise | null;
    item: QItem | null;
    attempts: number;
    maxAttempts: number | null;
    ok: boolean | null;
};

export type PracticeRuntimeTextResolvers = {
    raw: (key: string) => string;
    resolveText: (value: string) => string;
};

export type SessionHistoryRow = {
    instanceId: string;
    createdAt?: string | null;
    answeredAt?: string | null;

    expectedAnswerPayload?: any;
    explanation?: string | null;

    topic?: string | null;
    kind: string;
    difficulty?: Difficulty | string | null;
    title?: string | null;
    prompt?: string | null;

    publicPayload?: any;

    attempts?: number | null;
    lastOk?: boolean | null;
    lastRevealUsed?: boolean | null;
    lastAnswerPayload?: any;
    lastAttemptAt?: string | null;
};