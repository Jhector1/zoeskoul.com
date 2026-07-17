import type { TopicSeed } from "@zoeskoul/curriculum-contracts";
import {
    baseCourseGenerationPolicy,
    getCurriculumProfile,
} from "@zoeskoul/curriculum-profiles";

type PromptMode = "authoring" | "repair";

type ExerciseKindRule = {
    kind: string;
    description: string;
    requiredFields: string[];
    shapeRules: string[];
};

const GENERIC_EXERCISE_KIND_RULES: ExerciseKindRule[] = [
    {
        kind: "single_choice",
        description:
            "course-agnostic knowledge check with exactly one correct answer.",
        requiredFields: ["options", "correctOptionIds"],
        shapeRules: [
            "options must be plain strings, not objects.",
            "correctOptionIds must contain exactly one valid option id using a, b, c, d matching option positions.",
        ],
    },
    {
        kind: "multi_choice",
        description:
            "course-agnostic knowledge check with two or more genuinely correct answers when appropriate.",
        requiredFields: ["options", "correctOptionIds"],
        shapeRules: [
            "options must be plain strings, not objects.",
            "correctOptionIds must contain one or more valid option ids using a, b, c, d matching option positions.",
            "use multi_choice only when 2 or more options are genuinely correct.",
            "when the prompt asks learners to choose all correct answers or uses equivalent plural wording, strongly prefer 2 or more correct options when appropriate.",            "include every correct option in correctOptionIds, not just one example correct answer.",
        ],
    },
    {
        kind: "drag_reorder",
        description:
            "course-agnostic sequencing exercise where learners arrange the full correct order.",
        requiredFields: ["tokens", "correctOrder"],
        shapeRules: [
            "correctOrder must include the full intended sequence.",
        ],
    },
    {
        kind: "fill_blank_choice",
        description:
            "course-agnostic single-blank completion exercise with one exact correct choice.",
        requiredFields: ["template", "choices", "correctValue"],
        shapeRules: [
            "use exactly one blank only.",
            "do not create two or more blanks in the same exercise.",
            "the template must contain exactly one placeholder.",
            "correctValue must be non-empty and exactly match one of choices.",
            "if the concept needs two answers, split it into two exercises or use a different kind.",
        ],
    },
    {
        kind: "code_input",
        description:
            "implementation exercise whose runtime/recipe details may vary by profile, language, and execution model.",
        requiredFields: ["starterCode", "solutionCode"],
        shapeRules: [
            "solutionCode must never be empty.",
            "starterCode must be scaffolding only, not a completed answer.",
            "starterCode must not be identical to solutionCode after removing comments and whitespace.",
        ],
    },
];

export function renderExerciseKindPromptRules(args: {
    mode: PromptMode;
    seed: TopicSeed;
}): string[] {
    const profile = getCurriculumProfile(args.seed.profileId);
    const lines: string[] = [
        "Exercise-kind contract (generic to specific):",
        "- Base policy keeps exercise purposes distinct: Try It practice, regular practice, project steps, learner quizzes, and code_input runtime exercises are not interchangeable.",
        `- Base quiz policy: learner quizzes may use ${baseCourseGenerationPolicy.quiz.allowedKinds.join(", ")}; code_input is not a learner-quiz item by default.`,
        "- Put code_input items in practice or project-step authoring when required by the seed, not in the learner quiz card.",
        "- Try It exercises must align with the exact concept just taught and must not introduce commands, APIs, syntax, or concepts not already taught in this topic or earlier topics.",
        "- A Try It must solve a materially different task from every worked example in the topic; do not reuse the same expected result with only aliases, formatting, or ordering changed.",
        "- Project steps are progressive project work, not isolated practice drills; later steps must build on prior step output.",
        "",
    ];

    for (const rule of GENERIC_EXERCISE_KIND_RULES) {
        lines.push(`- ${rule.kind}: ${rule.description}`);
        lines.push(`- ${rule.kind} required fields: ${rule.requiredFields.join(", ")}.`);
        for (const shapeRule of rule.shapeRules) {
            lines.push(`- ${rule.kind} rule: ${shapeRule}`);
        }
    }

    lines.push("");
    lines.push("Code-input profile rules (most specific):");
    lines.push(
        ...(profile.renderExerciseKindPromptRules?.({
            mode: args.mode,
            seed: args.seed,
        }) ?? []),
    );

    if (args.mode === "authoring") {
        lines.push(
            "- Authoring items must stay course-agnostic at the exercise-kind level; push course-specific runtime differences into profile-specific code_input rules, grounded datasets, or the seed.",
        );
    } else {
        lines.push(
            "- Preserve the same exercise kind during repair; only repair structure, correctness, and profile/runtime compatibility.",
        );
    }

    return lines;
}
