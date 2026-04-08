import type {
    CodeLanguage,
    Exercise,
    TopicSlug,
    ValidateResponse,
    Vec3,
} from "@/lib/practice/types";

export type TopicValue = TopicSlug | "all";

export type PracticeHelpEntry = {
    key: string;
    label?: string;
    kind?: string;
    content?: string | null;
    reveal?: any | null;
    source?: string | null;
    openedAt: number;
};

export type PracticeHelpState = {
    openedStepKeys: string[];
    activeStepKey: string | null;
    entries: Record<string, PracticeHelpEntry>;
    busyStepKey: string | null;
    error: string | null;
};

export type QItem = {
    key: string;
    exercise: Exercise;

    single: string;
    multi: string[];
    num: string;

    dragA: Vec3;
    dragB: Vec3;

    matRows: number;
    matCols: number;
    mat: string[][];

    result: ValidateResponse | null;
    submitted: boolean;
    attempts?: number;

    code: string;
    codeLang: CodeLanguage;
    codeStdin: string;
    stdin?: string;

    text: string;

    reorderIds: string[];
    reorder: string[];

    voiceTranscript: string;
    voiceAudioId?: string;

    help: PracticeHelpState;

    // temporary legacy compatibility only
    revealed?: boolean;

    codeRunOutput?: string;
};

export type MissedItem = {
    id: string;
    at: number;
    topic: TopicSlug;
    kind: string;
    title: string;
    publicPayload?: any;
    prompt: string;
    userAnswer: any;
    expected: any;
    explanation?: string | null;
};