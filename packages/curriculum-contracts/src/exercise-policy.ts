export type ExerciseKindKey =
    | "single_choice"
    | "multi_choice"
    | "drag_reorder"
    | "fill_blank_choice"
    | "code_input";

export type ExerciseKindMix = Partial<Record<ExerciseKindKey, number>>;

export type ResolvedExercisePolicy = {
    source:
        | "module_spec"
        | "course_spec"
        | "blueprint_teaching_style"
        | "default";
    mix: Record<ExerciseKindKey, number>;
};