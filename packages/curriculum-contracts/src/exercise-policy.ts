export type ExerciseKindKey =
    | "single_choice"
    | "multi_choice"
    | "drag_reorder"
    | "fill_blank_choice"
    | "text_input"
    | "voice_input"
    | "word_bank_arrange"
    | "listen_build"
    | "pseudocode_input"
    | "code_input";

export type ExerciseKindMix = Partial<Record<ExerciseKindKey, number>>;

export type ResolvedExercisePolicy = {
    source:
        | "module_spec"
        | "course_spec"
        | "blueprint_teaching_style"
        | "default";
    mix: ExerciseKindMix;
};