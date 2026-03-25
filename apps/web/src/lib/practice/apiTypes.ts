import type {
    Difficulty,
    Exercise,
    TopicSlug,
    ValidateResponse,
    Vec3,
} from "@/lib/practice/types";
import type { MissedItem } from "@/lib/practice/uiTypes";
import type { SessionHistoryRow } from "@/lib/practice/runtime/types";

export type PracticeRunMetaApi =
    | {
    mode: "assignment";
    allowReveal: boolean;
    showDebug: boolean;
    maxAttempts: number;
    targetCount: number;
    returnUrl?: string | null;
    lockDifficulty: Difficulty;
    lockTopic: "all" | TopicSlug;
}
    | {
    mode: "session";
    allowReveal: boolean;
    showDebug: boolean;
    maxAttempts: number;
    targetCount: number;
    returnUrl?: string | null;
    lockDifficulty: Difficulty;
    lockTopic: "all" | TopicSlug;
}
    | {
    mode: "practice";
    allowReveal: boolean;
    showDebug: boolean;
    maxAttempts: number;
    targetCount: number;
    returnUrl?: string | null;
    lockDifficulty: null;
    lockTopic: null;
};

export type PracticeAttemptsInfo = {
    used?: number;
    left?: number;
    max?: number | null;
};

export type PracticeRevealVectors = {
    solutionA?: Vec3;
    b?: Vec3;
};

export type PracticeValidateClientResponse = ValidateResponse & {
    attempts?: PracticeAttemptsInfo;
    finalized?: boolean;

    sessionComplete?: boolean;
    returnUrl?: string | null;
    run?: PracticeRunMetaApi | null;

    reveal?: PracticeRevealVectors | null;
    revealAnswer?: PracticeRevealVectors | null;

    expected?: any;
    explanation?: string | null;
    message?: string | null;
};

export type PracticeExerciseGetResponse = {
    complete?: false;
    exercise: Exercise;
    key: string;

    sessionId?: string | null;
    run?: PracticeRunMetaApi | null;
    returnUrl?: string | null;

    explanation?: string | null;
    message?: string | null;
};

export type PracticeCompletedGetResponse = {
    complete: true;
    sessionId?: string | null;

    run?: PracticeRunMetaApi | null;
    returnUrl?: string | null;

    answeredCount?: number;
    totalCount?: number;
    correctCount?: number;
    targetCount?: number;

    missed?: MissedItem[];
    history?: SessionHistoryRow[];

    explanation?: string | null;
    message?: string | null;
};

export type PracticeStatusResponse = {
    sessionId: string;
    complete: boolean;

    answeredCount?: number;
    totalCount?: number;
    correctCount?: number;
    targetCount?: number;

    missed?: MissedItem[];
    history?: SessionHistoryRow[];

    run?: PracticeRunMetaApi | null;
    returnUrl?: string | null;

    explanation?: string | null;
    message?: string | null;
};

export type PracticeGetResponse =
    | PracticeExerciseGetResponse
    | PracticeCompletedGetResponse
    | PracticeStatusResponse;