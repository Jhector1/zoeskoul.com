import {PracticeKind} from "@prisma/client";

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


export type ExerciseKind =
    | "single_choice"
    | "multi_choice"
    | "numeric"
    | "vector_drag_target"
    | "vector_drag_dot"
    | "matrix_input"
    | "code_input"
    // ✅ NEW
    | "text_input"
    | "drag_reorder"
    | "voice_input" | "word_bank_arrange"
    | "listen_build"
    | "fill_blank_choice"; // ✅ ADD
// ✅ NEW;

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
    // hint?: string;
};
export type MatrixInputExercise = ExerciseBase & {
    kind: "matrix_input";
    rows: number;
    cols: number;
    tolerance: number; // per-entry tolerance
    // hint?: string;
    /**
     * Optional display / UX flags:
     * - step: for input stepping
     * - integerOnly: enforce integer parsing on submit
     */
    step?: number;
    integerOnly?: boolean;
};

export type MultiChoiceExercise = ExerciseBase & {
    kind: "multi_choice";
    options: { id: string; text: string }[];
};

export type NumericExercise = ExerciseBase & {
    kind: "numeric";
    // hint?: string;
    tolerance?: number;
    /**
     * Optional; don’t include in production payloads if you don’t want to leak answers.
     * Validation should rely on signed expected.
     */
    correctValue?: number;
};

export type VectorDragTargetExercise = ExerciseBase & {
    kind: "vector_drag_target";
    initialA: Vec3;
    initialB?: Vec3;
    targetA: Vec3;
    lockB: boolean;
    targetB?: Vec3; // ✅ add

    tolerance: number;
};

export type VectorDragDotExercise = ExerciseBase & {
    kind: "vector_drag_dot";
    initialA: Vec3;
    b: Vec3;
    targetDot: number;
    tolerance: number;
};

// ---------------- NEW Exercise types ----------------

export type TextInputExercise = ExerciseBase & {
    kind: "text_input";
    placeholder?: string;
    /**
     * optional UI helper: "short" vs "long"
     */
    ui?: "short" | "long";
    // hint?: string | null;
};

export type DragToken = { id: string; text: string };

export type DragReorderExercise = ExerciseBase & {
    kind: "drag_reorder";
    tokens: DragToken[];
    // hint?: string | null;
};

export type VoiceInputExercise = ExerciseBase & {
    kind: "voice_input";
    /**
     * What the learner should say (displayed as the target).
     */
    targetText: string;
    /**
     * optional locale hint for client STT
     */
    locale?: string; // e.g. "ht-HT" (or "fr-FR", etc.)
    maxSeconds?: number;
    // hint?: string | null;
};

// ---------------- Existing exercises ----------------
// export type SingleChoiceExercise = ...
// export type CodeInputExercise = ...
// etc

// src/lib/practice/types.ts (or wherever Exercise is defined)

// export type CodeLanguage =
//     | "python"
//     | "javascript"
//     | "c"
//     | "java" | "cpp";
    // | "csharp";

// export type CodeInputExercise = ExerciseBase & {

//   kind: "code_input";

//   language: CodeLanguage;
//   starterCode?: string;

//   // optional: show tests/examples
//   examples?: Array<{ input?: string; output: string }>;
// };

export type CodeInputExercise = ExerciseBase & {
    kind: "code_input";

    language?: CodeLanguage; // default "python" if omitted
    starterCode?: string; // what user starts with
    stdinHint?: string; // optional UI hint
    editorHeight?: number; // optional (defaults in UI)
    allowLanguageSwitch?: boolean; // optional (default true/false, your choice)

    // hint?: string; // optional hint shown like other exercises

    // Optional: if you want to show sample IO
    examples?: Array<{ stdin?: string; stdout: string }>;
};

export type WordBankArrangeExercise = ExerciseBase & {
    kind: "word_bank_arrange";
    targetText: string;
    locale?: string;
    // hint?: string | null;
    wordBank?: string[];
    distractors?: string[];
    ttsText?: string;
};

export type ListenBuildExercise = ExerciseBase & {
    kind: "listen_build";
    targetText: string;
    locale?: string;
    // hint?: string | null;
    wordBank?: string[];
    distractors?: string[];
};

export type FillBlankChoiceExercise = ExerciseBase & {
    kind: "fill_blank_choice";
    template: string;
    choices: string[];
    correct?: string; // (optional; ideally only in signed expected)
    locale?: string;
    // hint?: string | null;
};
// export type Exercise =
//   | NumericExercise
//   | SingleChoiceExercise
//   | MultiChoiceExercise
//   | MatrixInputExercise
//   | VectorDragTargetExercise
//   | VectorDragDotExercise

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
    transcript: string; // client STT result
    // optional if you store audio elsewhere:
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
    | FillBlankChoiceExercise; // ✅ include

export type WordBankArrangeSubmitAnswer = {
    kind: "word_bank_arrange";
    value: string; // assembled sentence
};

export type ListenBuildSubmitAnswer = {
    kind: "listen_build";
    value: string; // assembled sentence
};

export type FillBlankChoiceSubmitAnswer = {
    kind: "fill_blank_choice";
    value: string; // selected choice
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
    | FillBlankChoiceSubmitAnswer;;

export type ValidateResponse = {
    ok: boolean;
    expected: any;
    explanation?: string;
};
export type PoolKind = PracticeKind;
export type SqlDialect = "postgres" | "mysql" | "sqlite" | "mssql";

export type CodeLanguage =
    | "python"
    | "java"
    | "javascript"
    | "c"
    | "cpp"
    | "sql";