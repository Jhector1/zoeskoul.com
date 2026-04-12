import {PracticeKind} from "@prisma/client";
import {CodeLanguage} from "@zoeskoul/code-contracts"
// src/lib/practice/types.ts
export type Difficulty = "easy" | "medium" | "hard";

/**
 * DB-facing slug (unlimited).
 * Canonical topic id for UI + URL + DB.
 */
export type TopicSlug = string;

/**
 * @deprecated Use TopicSlug. Kept for backward compatibility.
 */
export type Topic = TopicSlug;

/**
 * Generator engine keys (ONLY engines you implement).
 */

export type GenKey =

    | "python_part1" // ✅ NEW

    | "sql_for_beginners"


export type ExerciseKind =
    | "single_choice"
    | "multi_choice"
    | "numeric"
    | "vector_drag_target"
    | "vector_drag_dot"
    | "matrix_input"
    | "code_input"
    | "text_input"
    | "drag_reorder"
    | "voice_input" | "word_bank_arrange"
    | "listen_build"
    | "fill_blank_choice";

export type Vec3 = { x: number; y: number; z?: number };

export type ExerciseHelpSpec = Partial<Record<string, string>>;

export type ExerciseBase = {
    id: string;
    topic: TopicSlug;
    difficulty: Difficulty;
    title: string;
    prompt: string;

    help?: ExerciseHelpSpec;

    // legacy compatibility
    hint?: string;
};

export type SingleChoiceExercise = ExerciseBase & {
    kind: "single_choice";
    options: { id: string; text: string }[];
};

export type MatrixInputExercise = ExerciseBase & {
    kind: "matrix_input";
    rows: number;
    cols: number;
    tolerance: number;
    step?: number;
    integerOnly?: boolean;
};

export type MultiChoiceExercise = ExerciseBase & {
    kind: "multi_choice";
    options: { id: string; text: string }[];
};

export type NumericExercise = ExerciseBase & {
    kind: "numeric";
    tolerance?: number;
    correctValue?: number;
};

export type VectorDragTargetExercise = ExerciseBase & {
    kind: "vector_drag_target";
    initialA: Vec3;
    initialB?: Vec3;
    targetA: Vec3;
    lockB: boolean;
    targetB?: Vec3;
    tolerance: number;
};

export type VectorDragDotExercise = ExerciseBase & {
    kind: "vector_drag_dot";
    initialA: Vec3;
    b: Vec3;
    targetDot: number;
    tolerance: number;
};


export type TerminalExpectedExample = {
    kind: "terminal";
    meta?: string;
    stdin?: string;
    stdout: string;
};

export type SqlResultExpectedExample = {
    kind: "sql_result";
    meta?: string;
    columns: string[];
    rows: Array<Array<string | number | null>>;
};

export type CodeExpectedExample =
    | TerminalExpectedExample
    | SqlResultExpectedExample;

export type CodeInputExercise = ExerciseBase & {
    kind: "code_input";

    language?: CodeLanguage;
    starterCode?: string;
    starterStdin?: string;
    stdinHint?: string;
    editorHeight?: number;
    allowLanguageSwitch?: boolean;
    examples?: Array<{ stdin?: string; stdout: string }>;

    fixedSqlDialect?: SqlDialect;
    runtime?: SqlRuntimeSpec;

    expectedExample?: CodeExpectedExample | null;
};





export type TextInputExercise = ExerciseBase & {
    kind: "text_input";
    placeholder?: string;
    ui?: "short" | "long";
};

export type DragToken = { id: string; text: string };

export type DragReorderExercise = ExerciseBase & {
    kind: "drag_reorder";
    tokens: DragToken[];
};

export type VoiceInputExercise = ExerciseBase & {
    kind: "voice_input";
    targetText: string;
    locale?: string;
    maxSeconds?: number;
};

export type SqlRuntimeSpec = {
    kind: "sql";
    datasetId?: string;
    resultShape?: "table";
};



export type WordBankArrangeExercise = ExerciseBase & {
    kind: "word_bank_arrange";
    targetText: string;
    locale?: string;
    wordBank?: string[];
    distractors?: string[];
    ttsText?: string;
};

export type ListenBuildExercise = ExerciseBase & {
    kind: "listen_build";
    targetText: string;
    locale?: string;
    wordBank?: string[];
    distractors?: string[];
};

export type FillBlankChoiceExercise = ExerciseBase & {
    kind: "fill_blank_choice";
    template: string;
    choices: string[];
    correct?: string;
    locale?: string;
};

export type TextInputSubmitAnswer = {
    kind: "text_input";
    value: string;
};

export type DragReorderSubmitAnswer = {
    kind: "drag_reorder";
    tokenIds?: string[]; order?: string[];
};

export type VoiceInputSubmitAnswer = {
    kind: "voice_input";
    transcript: string;
    audioUrl?: string;
    audioId?: string
};

export type Exercise =
    | SingleChoiceExercise
    | MultiChoiceExercise
    | NumericExercise
    | VectorDragTargetExercise
    | VectorDragDotExercise
    | MatrixInputExercise
    | CodeInputExercise
    | TextInputExercise
    | DragReorderExercise
    | VoiceInputExercise | WordBankArrangeExercise
    | ListenBuildExercise
    | FillBlankChoiceExercise;

export type WordBankArrangeSubmitAnswer = {
    kind: "word_bank_arrange";
    value: string;
};

export type ListenBuildSubmitAnswer = {
    kind: "listen_build";
    value: string;
};

export type FillBlankChoiceSubmitAnswer = {
    kind: "fill_blank_choice";
    value: string;
};

export type SubmitAnswer =
    | { kind: "single_choice"; optionId: string }
    | { kind: "multi_choice"; optionIds: string[] }
    | { kind: "numeric"; value: number }
    | { kind: "vector_drag_target"; a: Vec3; b: Vec3 }
    | { kind: "vector_drag_dot"; a: Vec3 }
    | { kind: "matrix_input"; values: number[][] }
    | {
    kind: "code_input";
    language?: CodeLanguage;
    code: string;
    stdin?: string;
}
    | TextInputSubmitAnswer
    | DragReorderSubmitAnswer
    | VoiceInputSubmitAnswer | WordBankArrangeSubmitAnswer
    | ListenBuildSubmitAnswer
    | FillBlankChoiceSubmitAnswer;

export type ValidateGamificationPayload = {
    xpGained: number;
    leveledUp: boolean;
    streakExtended: boolean;
    awarded: Array<{
        sourceType: string;
        xpDelta: number;
        reason: string;
    }>;
    summary: {
        totalXp: number;
        level: number;
        currentStreak: number;
        longestStreak: number;
        xpIntoLevel: number;
        xpForNextLevel: number | null;
        levelProgressPct: number;
    };
};

export type ValidateResponse = {
    ok: boolean;
    expected: any;
    explanation?: string | null;
    feedback?: string | null;
    finalized?: boolean;
    attempts?: {
        used: number;
        max: number | null;
        left: number | null;
    };
    sessionComplete?: boolean;
    summary?: unknown;
    returnUrl?: string | null;
    requestId?: string;
    gamification?: ValidateGamificationPayload | null;
};

export type PoolKind = PracticeKind;
export type SqlDialect = "postgres" | "mysql" | "sqlite" | "mssql";

export type {CodeLanguage}