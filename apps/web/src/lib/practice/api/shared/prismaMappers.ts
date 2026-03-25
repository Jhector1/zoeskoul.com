import {
    PracticeDifficulty as DbPracticeDifficulty,
    PracticeKind,
} from "@prisma/client";

export function toPracticeKindOrThrow(kind: unknown): PracticeKind {
    const k = String(kind ?? "").trim() as PracticeKind;

    const allowed = new Set<PracticeKind>([
        PracticeKind.numeric,
        PracticeKind.single_choice,
        PracticeKind.multi_choice,
        PracticeKind.vector_drag_target,
        PracticeKind.vector_drag_dot,
        PracticeKind.matrix_input,
        PracticeKind.code_input,
        PracticeKind.text_input,
        PracticeKind.drag_reorder,
        PracticeKind.voice_input,
        PracticeKind.word_bank_arrange,
        PracticeKind.listen_build,
        PracticeKind.fill_blank_choice,
    ]);

    if (!allowed.has(k)) {
        throw new Error(`Unsupported kind "${k}" for PracticeKind.`);
    }

    return k;
}

export function toDbDifficultyOrThrow(d: unknown): DbPracticeDifficulty {
    const s = String(d ?? "").trim();
    if (s === "easy") return DbPracticeDifficulty.easy;
    if (s === "medium") return DbPracticeDifficulty.medium;
    if (s === "hard") return DbPracticeDifficulty.hard;
    throw new Error(`Invalid difficulty "${s}" (expected easy|medium|hard).`);
}