import type {
    CourseBlueprint,
    CourseSpec,
    ExerciseKindKey,
    ExerciseKindMix,
    ResolvedExercisePolicy,
} from "@zoeskoul/curriculum-contracts";

const KIND_KEYS: ExerciseKindKey[] = [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "code_input",
];

const DEFAULT_MIX: Record<ExerciseKindKey, number> = {
    single_choice: 0.15,
    multi_choice: 0.15,
    drag_reorder: 0.1,
    fill_blank_choice: 0.25,
    code_input: 0.35,
};

function normalizeMix(mix: ExerciseKindMix): Record<ExerciseKindKey, number> {
    const safe: Record<ExerciseKindKey, number> = {
        single_choice: Math.max(0, mix.single_choice ?? 0),
        multi_choice: Math.max(0, mix.multi_choice ?? 0),
        drag_reorder: Math.max(0, mix.drag_reorder ?? 0),
        fill_blank_choice: Math.max(0, mix.fill_blank_choice ?? 0),
        code_input: Math.max(0, mix.code_input ?? 0),
    };

    const total = KIND_KEYS.reduce((sum, key) => sum + safe[key], 0);

    if (total <= 0) {
        return { ...DEFAULT_MIX };
    }

    return {
        single_choice: safe.single_choice / total,
        multi_choice: safe.multi_choice / total,
        drag_reorder: safe.drag_reorder / total,
        fill_blank_choice: safe.fill_blank_choice / total,
        code_input: safe.code_input / total,
    };
}

function buildMixFromTeachingStyle(
    blueprint: CourseBlueprint,
): Record<ExerciseKindKey, number> {
    const quizWeight = Math.max(0, blueprint.teachingStyle?.quizWeight ?? 0.5);
    const codeInputWeight = Math.max(
        0,
        blueprint.teachingStyle?.codeInputWeight ?? 0.2,
    );

    return normalizeMix({
        single_choice: quizWeight * 0.25,
        multi_choice: quizWeight * 0.2,
        drag_reorder: quizWeight * 0.15,
        fill_blank_choice: quizWeight * 0.4,
        code_input: codeInputWeight,
    });
}

export function resolveExercisePolicy(args: {
    blueprint: CourseBlueprint;
    spec?: CourseSpec | null;
    moduleSlug: string;
}): ResolvedExercisePolicy {
    const moduleSpec = args.spec?.modules.find(
        (module) => module.moduleSlug === args.moduleSlug,
    );

    if (moduleSpec?.exercisePolicy?.mix) {
        return {
            source: "module_spec",
            mix: normalizeMix(moduleSpec.exercisePolicy.mix),
        };
    }

    if (args.spec?.policy?.exercisePolicy?.defaultMix) {
        return {
            source: "course_spec",
            mix: normalizeMix(args.spec.policy.exercisePolicy.defaultMix),
        };
    }

    if (args.blueprint.teachingStyle) {
        return {
            source: "blueprint_teaching_style",
            mix: buildMixFromTeachingStyle(args.blueprint),
        };
    }

    return {
        source: "default",
        mix: { ...DEFAULT_MIX },
    };
}