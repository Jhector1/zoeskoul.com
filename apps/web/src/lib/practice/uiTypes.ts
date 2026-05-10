import type {
    WorkspaceLanguage,
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
type PracticeUiMeta = {
    reorderTouched?: boolean;
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
    codeLang: WorkspaceLanguage;
    codeStdin: string;
    stdin?: string;

    text: string;

    reorder?: string[];
    reorderIds?: string[]; // legacy only
    /**
     * Controls whether wrong feedback is hidden after the learner edits
     * a previously submitted answer.
     */
    feedbackDismissed?: boolean;
    voiceTranscript: string;
    voiceAudioId?: string;

    help: PracticeHelpState;

    ui?: PracticeUiMeta;

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