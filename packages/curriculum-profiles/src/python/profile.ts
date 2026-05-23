// import type { CourseProfile } from "../types.js";
//
// export const pythonProfile: CourseProfile = {
//     id: "python",
//     allowedExerciseKinds: [
//         "single_choice",
//         "multi_choice",
//         "drag_reorder",
//         "fill_blank_choice",
//         "code_input",
//     ],
//     allowedRecipeTypes: ["fixed_tests", "template_io"],
//
//     buildModuleRuntimeDefaults() {
//         return {
//             kind: "code",
//             language: "python",
//         };
//     },
//
//     getRecipeRegistry() {
//         return {};
//     },
//
//     validateTopicBundle() {
//         return [];
//     },
// };





import type {
    ManifestCodeInput,
    ProgrammingCodeInputTestDraft,
    TopicRecipe,
    BuildSubjectManifestArgs,
    BuildTopicSeedArgs,
    CompileTopicRecipeArgs,
} from "@zoeskoul/curriculum-contracts";
import { SemanticCheckSchema } from "@zoeskoul/practice-checks";
import { buildBaseSubjectManifest } from "../shared/buildBaseSubjectManifest.js";
import type {
    CodeInputHelpFallback,
    CodeInputProfileCapability,
    CourseProfile,
    CourseProfileAdapter,
} from "../types.js";
import { pythonShape } from "../shapes/pythonShape.js";

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function requireProgrammingTests(
    exercise: {
        id: string;
        tests?: ProgrammingCodeInputTestDraft[];
    },
    topicId: string,
) {
    const tests = Array.isArray(exercise.tests)
        ? exercise.tests
            .map((test: ProgrammingCodeInputTestDraft) => {
                const match: "exact" | "includes" =
                    test.match === "includes" ? "includes" : "exact";

                return {
                    ...(typeof test.stdin === "string"
                        ? { stdin: test.stdin }
                        : {}),
                    stdout: String(test.stdout ?? ""),
                    match,
                };
            })
            .filter((test: { stdout: string }) => test.stdout.trim().length > 0)
        : [];

    if (tests.length < 1) {
        throw new Error(
            [
                `Programming code_input exercise "${exercise.id}" needs at least one stdin/stdout test case.`,
                `Topic: ${topicId}`,
                `Use the authoring draft "tests" field so the compiler can publish a valid fixed_tests recipe.`,
            ].join("\n"),
        );
    }

    return tests;
}

function requireSemanticChecks(value: unknown, exerciseId: string) {
    const parsed = SemanticCheckSchema.array().safeParse(value);

    if (!parsed.success || parsed.data.length < 1) {
        throw new Error(
            [
                `Semantic code_input exercise "${exerciseId}" needs at least one valid semantic check.`,
                `Received: ${JSON.stringify(value, null, 2)}`,
            ].join("\n"),
        );
    }

    return parsed.data;
}

function makePythonCodeHelpFallback(args: {
    title: string;
    prompt: string;
    seed?: any;
}): CodeInputHelpFallback {
    const task = args.title || args.prompt || "this coding task";
    const workspaceUi = args.seed?.workspacePolicy?.workspace.ui;
    const editorLabel = workspaceUi?.editorLabel ?? "code editor";
    const runButtonLabel = workspaceUi?.runButtonLabel ?? "Run";
    const resultsLabel =
        workspaceUi?.outputPanelLabel ??
        workspaceUi?.resultsTableLabel ??
        "output panel";

    return {
        hint: `Read the task "${task}" and identify the required result.`,
        help: {
            concept: `This coding exercise checks whether your code produces the requested result for: "${task}".`,
            hint_1: `Use the statement or expression that matches the required behavior in the ${editorLabel}.`,
            hint_2: `Click ${runButtonLabel} and compare the ${resultsLabel} with the expected result.`,
        },
    };
}

const pythonCodeInputCapability: CodeInputProfileCapability = {
    minimumFixedTests: 2,
    defaultStarter() {
        return "# Write your answer below\n";
    },
    defaultRecipeType(args) {
        const hasSemanticChecks =
            Array.isArray(args.exercise.semanticChecks) &&
            args.exercise.semanticChecks.length > 0;
        const hasTests =
            Array.isArray(args.exercise.tests) && args.exercise.tests.length > 0;

        if (args.exercise.recipeType) {
            return args.exercise.recipeType;
        }

        if (hasSemanticChecks) return "semantic";
        if (hasTests) return "fixed_tests";
        return undefined;
    },
    repairDraft(args) {
        const exercise = args.exercise;
        const hasSemanticChecks =
            Array.isArray(exercise.semanticChecks) &&
            exercise.semanticChecks.length > 0;
        const hasTests =
            Array.isArray(exercise.tests) && exercise.tests.length > 0;

        const recipeType =
            pythonCodeInputCapability.defaultRecipeType(args) ??
            (hasSemanticChecks ? "semantic" : "fixed_tests");

        const repairedTests =
            hasTests || hasSemanticChecks
                ? exercise.tests
                : [
                    {
                        stdin: "12\n",
                        stdout: "13",
                        match: "includes" as const,
                    },
                    {
                        stdin: "20\n",
                        stdout: "21",
                        match: "includes" as const,
                    },
                ];

        return {
            ...exercise,
            recipeType,
            ...(repairedTests?.length ? { tests: repairedTests } : {}),
        };
    },
    getHelpFallback(args) {
        return makePythonCodeHelpFallback(args);
    },
    buildManifest(args): ManifestCodeInput {
        const recipeType = pythonCodeInputCapability.defaultRecipeType(args);
        const useSemantic =
            recipeType === "semantic" ||
            (Array.isArray(args.exercise.semanticChecks) &&
                args.exercise.semanticChecks.length > 0);

        const starterCode = normalizeText(args.exercise.starterCode);
        const solutionCode = normalizeText(args.exercise.solutionCode);

        return {
            id: args.exercise.id,
            kind: "code_input",
            purpose: "project",
            weight: 1,
            messageBase: args.messageBase,
            language: "python",
            starterCode,
            workspace: {
                language: "python",
                entryFilePath: "main.py",
                starterCode,
                starterFiles: [
                    {
                        path: "main.py",
                        content: starterCode,
                        language: "python",
                        isEntry: true,
                        entry: true,
                    },
                ],
            },
            showExpectedExample: useSemantic ? false : true,
            recipe: useSemantic
                ? {
                    type: "semantic",
                    language: "python",
                    solutionCode,
                    semanticChecks: requireSemanticChecks(
                        args.exercise.semanticChecks,
                        args.exercise.id,
                    ),
                }
                : {
                    type: "fixed_tests",
                    tests: requireProgrammingTests(args.exercise, args.seed.topicId),
                    solutionCode,
                },
        };
    },
};

export const pythonProfile: CourseProfile = {
    id: "python",
    shape: pythonShape,
    runtimeKind: "code",
    defaultLanguage: "python",
    defaultEntryFileName: "main.py",
    allowedExerciseKinds: [
        "single_choice",
        "multi_choice",
        "drag_reorder",
        "fill_blank_choice",
        "code_input",
    ],
    allowedRecipeTypes: ["fixed_tests", "template_io", "semantic"],
    qualityPolicy: {
        repeatedExerciseTextThreshold: 2,
    },
    buildModuleRuntimeDefaults() {
        return { kind: "code", language: "python" };
    },
    renderExerciseKindPromptRules(args) {
        const lines = [
            '- For Python code_input, prefer recipeType "fixed_tests" when the exercise is a normal runnable program.',
            "- For Python code_input, include a tests array with one or more real stdin/stdout cases when using fixed_tests.",
            '- For Python code_input, use recipeType "semantic" only when semanticChecks are truly needed.',
            "- For Python code_input, solutionCode must be a complete runnable program that reads stdin when needed and prints the final answer.",
            "- For Python code_input, starterCode must stay as scaffolding and must not reveal the full solution.",
        ];

        if (args.mode === "authoring") {
            lines.push(
                '- Never leave recipeType ambiguous for Python code_input exercises.',
            );
        }

        return lines;
    },
    renderAuthoringPromptRules() {
        return [
            "Python code_input self-check:",
            '- For normal beginner output exercises, set recipeType to "fixed_tests" and include tests[].',
            '- For class, object, method, attribute, return-value, or structure-checking exercises, set recipeType to "semantic" and include semanticChecks[].',
            '- If recipeType is "semantic", do not rely on stdout tests.',
            '- If recipeType is "fixed_tests", include at least one stdin/stdout test.',
            "- Hints explain the concept but do not reveal the final answer wording.",
        ];
    },
    codeInput: pythonCodeInputCapability,
    getRecipeRegistry() {
        return {};
    },
    validateTopicBundle() {
        return [];
    },
};
