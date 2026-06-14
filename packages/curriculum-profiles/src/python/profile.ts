



import {
    ManifestCodeInput,
    ManifestFileFixture,
    ManifestStarterFile,
    ManifestWorkspaceExpectations,
    ProgrammingCodeInputTestDraft,
    ProgrammingCodeInputStarterFileDraft,
    normalizeWorkspaceExpectations,
    normalizeWorkspacePath,
} from "@zoeskoul/curriculum-contracts";
import { SemanticCheckSchema } from "@zoeskoul/practice-checks";
import type {
    CodeInputHelpFallback,
    CodeInputProfileCapability,
    CourseProfile,
    ProjectProfileCapability,
} from "../types.js";
import { pythonShape } from "../shapes/pythonShape.js";

export const PYTHON_MINIMUM_FIXED_TESTS = 2;

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}


function safeNormalizeWorkspacePath(path: string, label: string): string {
    try {
        return normalizeWorkspacePath(path);
    } catch (error) {
        throw new Error(`${label}: ${(error as Error).message}`);
    }
}

function normalizePythonStarterFiles(
    files: ProgrammingCodeInputStarterFileDraft[] | undefined,
): ManifestStarterFile[] {
    if (!Array.isArray(files)) return [];

    const seen = new Set<string>();
    const normalized: ManifestStarterFile[] = [];

    for (const file of files) {
        const path = safeNormalizeWorkspacePath(file.path, "Invalid Python starter file path");

        if (seen.has(path)) continue;
        seen.add(path);

        normalized.push({
            path,
            content: String(file.content ?? ""),
            language: file.language ?? "python",
            ...(typeof file.isEntry === "boolean"
                ? { isEntry: file.isEntry }
                : {}),
            ...(typeof file.entry === "boolean"
                ? { entry: file.entry }
                : {}),
            ...(typeof file.readOnly === "boolean"
                ? { readOnly: file.readOnly }
                : {}),
        });
    }

    return normalized;
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
                    ...(Array.isArray(test.files) && test.files.length > 0
                        ? {
                            files: normalizePythonTestFiles(test.files),
                        }
                        : {}),
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

    if (tests.length < PYTHON_MINIMUM_FIXED_TESTS) {
        throw new Error(
            [
                `Programming code_input exercise "${exercise.id}" needs at least ${PYTHON_MINIMUM_FIXED_TESTS} meaningful stdin/stdout test cases.`,
                `Topic: ${topicId}`,
                "Use distinct fixed_tests coverage, or switch the exercise to semantic checks when stdout-based validation is not the right fit.",
            ].join("\n"),
        );
    }

    return tests;
}

function normalizePythonTestFiles(
    files: ManifestFileFixture[] | undefined,
): ManifestFileFixture[] {
    if (!Array.isArray(files)) return [];

    return files
        .filter((file) => normalizeText(file.path))
        .map((file) => ({
            path: safeNormalizeWorkspacePath(
                file.path,
                "Invalid Python test fixture path",
            ),
            content: String(file.content ?? ""),
            ...(typeof file.readOnly === "boolean"
                ? { readOnly: file.readOnly }
                : {}),
        }));
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

function normalizePythonFixtureFiles(
    files: Array<{
        path: string;
        content: string;
        readOnly?: boolean;
    }> | undefined,
): ManifestStarterFile[] {
    if (!Array.isArray(files)) return [];

    return files
        .filter((file) => normalizeText(file.path))
        .map((file) => ({
            path: safeNormalizeWorkspacePath(
                file.path,
                "Invalid Python fixture file path",
            ),
            content: String(file.content ?? ""),
            ...(typeof file.readOnly === "boolean"
                ? { readOnly: file.readOnly }
                : {}),
        }));
}

function normalizePythonWorkspaceExpectations(
    value: unknown,
): ManifestWorkspaceExpectations | undefined {
    if (typeof value === "undefined") return undefined;

    try {
        return normalizeWorkspaceExpectations(value, "workspaceExpectations");
    } catch (error) {
        throw new Error(`Invalid Python workspaceExpectations: ${(error as Error).message}`);
    }
}

const pythonCodeInputCapability: CodeInputProfileCapability = {
    minimumFixedTests: PYTHON_MINIMUM_FIXED_TESTS,
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
        const { tests: _discardTests, ...exercise } = args.exercise;
        const hasSemanticChecks =
            Array.isArray(exercise.semanticChecks) &&
            exercise.semanticChecks.length > 0;
        const hasTests =
            Array.isArray(args.exercise.tests) && args.exercise.tests.length > 0;

        const recipeType =
            pythonCodeInputCapability.defaultRecipeType(args) ??
            (hasSemanticChecks ? "semantic" : "fixed_tests");
        const recipeTypeValue = String(recipeType ?? "");

        if (recipeTypeValue === "shell_task") {
            return {
                ...exercise,
                recipeType,
            };
        }

        const repairedTests =
            recipeType === "semantic"
                ? undefined
                : hasTests
                    ? args.exercise.tests
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
    showExpectedExample() {
        return true;
    },
    buildManifest(args): ManifestCodeInput {
        const recipeType = pythonCodeInputCapability.defaultRecipeType(args);
        const recipeTypeValue = String(recipeType ?? "");
        const fixedLanguage =
            typeof (args.exercise as { fixedLanguage?: unknown }).fixedLanguage === "string"
                ? String((args.exercise as { fixedLanguage?: unknown }).fixedLanguage).trim()
                : "";
        const manifestLanguage = fixedLanguage === "bash" ? "bash" : "python";
        const useSemantic =
            recipeTypeValue === "semantic" ||
            (Array.isArray(args.exercise.semanticChecks) &&
                args.exercise.semanticChecks.length > 0);

        const fallbackStarterCode = normalizeText(args.exercise.starterCode);
        const solutionCode = normalizeText(args.exercise.solutionCode);

        const authoredEntryFilePath = safeNormalizeWorkspacePath(
            (args.exercise as { entryFilePath?: string }).entryFilePath ??
                (manifestLanguage === "bash" ? "main.sh" : "main.py"),
            "Invalid Python entryFilePath",
        );

        const authoredStarterFiles = normalizePythonStarterFiles(
            (args.exercise as { starterFiles?: ProgrammingCodeInputStarterFileDraft[] })
                .starterFiles,
        );
        const authoredSolutionFiles = normalizePythonStarterFiles(
            (args.exercise as { solutionFiles?: ProgrammingCodeInputStarterFileDraft[] })
                .solutionFiles,
        );
        const workspaceExpectations = normalizePythonWorkspaceExpectations(
            (args.exercise as { workspaceExpectations?: ManifestWorkspaceExpectations })
                .workspaceExpectations,
        );
        const sourceChecks = Array.isArray((args.exercise as { sourceChecks?: unknown[] }).sourceChecks)
            ? (args.exercise as { sourceChecks?: unknown[] }).sourceChecks
            : undefined;

        const hasAuthoredStarterFiles = authoredStarterFiles.length > 0;

        let starterFiles: ManifestStarterFile[] = hasAuthoredStarterFiles
            ? authoredStarterFiles
            : [
                {
                    path: authoredEntryFilePath,
                    content: fallbackStarterCode,
                    language: manifestLanguage,
                    isEntry: true,
                    entry: true,
                },
            ];

        const hasEntryFile = starterFiles.some(
            (file) => file.path === authoredEntryFilePath,
        );

        if (!hasEntryFile) {
            starterFiles = [
                {
                    path: authoredEntryFilePath,
                    content: fallbackStarterCode,
                    language: manifestLanguage,
                    isEntry: true,
                    entry: true,
                },
                ...starterFiles,
            ];
        }

        starterFiles = starterFiles.map((file) =>
            file.path === authoredEntryFilePath
                ? {
                    ...file,
                    language: file.language ?? manifestLanguage,
                    isEntry: true,
                    entry: true,
                }
                : {
                    ...file,
                    language: file.language ?? manifestLanguage,
                    isEntry: file.isEntry === true ? false : file.isEntry,
                    entry: file.entry === true ? false : file.entry,
                },
        );

        const starterPathSet = new Set(starterFiles.map((file) => file.path));
        const fixtureFiles = normalizePythonFixtureFiles(args.exercise.files).filter(
            (file) => !starterPathSet.has(file.path ?? ""),
        );

        const entryStarterFile =
            starterFiles.find((file) => file.path === authoredEntryFilePath) ??
            starterFiles[0];

        const starterCode =
            typeof entryStarterFile?.content === "string"
                ? entryStarterFile.content
                : fallbackStarterCode;

        const solutionFiles = authoredSolutionFiles.length > 0
            ? authoredSolutionFiles
            : [
                {
                    path: authoredEntryFilePath,
                    content: solutionCode,
                    language: manifestLanguage,
                    isEntry: true,
                    entry: true,
                },
            ];

        return {
            id: args.exercise.id,
            kind: "code_input",
            purpose: "project",
            weight: 1,
            messageBase: args.messageBase,
            language: manifestLanguage,
            starterCode,
            starterFiles,
            solutionFiles,
            ...(sourceChecks?.length ? { sourceChecks } : {}),
            ...(workspaceExpectations ? { workspaceExpectations } : {}),
            workspace: {
                language: manifestLanguage,
                entryFilePath: authoredEntryFilePath,
                starterCode,
                starterFiles,
                ...(workspaceExpectations ? { workspaceExpectations } : {}),
                ...(fixtureFiles.length > 0
                    ? {
                        files: fixtureFiles,
                    }
                    : {}),
            },
            showExpectedExample:
                pythonCodeInputCapability.showExpectedExample?.({
                    exercise: args.exercise,
                    seed: args.seed,
                    recipeType,
                }) ?? true,
            recipe: recipeTypeValue === "shell_task"
                ? ({
                    type: "shell_task",
                    ...((args.exercise as { mode?: unknown }).mode === "terminal_workspace" ||
                    (args.exercise as { mode?: unknown }).mode === "stdout" ||
                    (args.exercise as { mode?: unknown }).mode === "workspace_and_stdout"
                        ? {
                            mode: (args.exercise as { mode?: "terminal_workspace" | "stdout" | "workspace_and_stdout" }).mode,
                        }
                        : {}),
                    ...(typeof (args.exercise as { instructions?: unknown }).instructions === "string" &&
                    String((args.exercise as { instructions?: unknown }).instructions).trim()
                        ? { instructions: String((args.exercise as { instructions?: unknown }).instructions).trim() }
                        : {}),
                } as ManifestCodeInput["recipe"])
                : useSemantic
                ? {
                    type: "semantic",
                    language: "python",
                    solutionCode,
                    solutionFiles,
                    ...(sourceChecks?.length ? { sourceChecks } : {}),
                    semanticChecks: requireSemanticChecks(
                        args.exercise.semanticChecks,
                        args.exercise.id,
                    ),
                }
                : {
                    type: "fixed_tests",
                    tests: requireProgrammingTests(args.exercise, args.seed.topicId),
                    solutionCode,
                    solutionFiles,
                    ...(sourceChecks?.length ? { sourceChecks } : {}),
                },
        };
    },};

const pythonProjectCapability: ProjectProfileCapability = {
    getProjectConfig(args) {
        if (args.topicKind === "capstone") {
            return {
                preferredProjectExerciseKind: "code_input",
                minStepCount: 5,
                targetStepCount: 5,
                allowReveal: true,
                tryItDefault: {
                    enabled: true,
                    sketchIndex: 0,
                    allowReveal: true,
                },
                projectFlowDefault: "progressive",
                projectTitle: "Final Capstone Project",
                projectStepLabel: "Capstone step",
                startPromptPrefix: "Start the final capstone project.",
                continuePromptPrefix:
                    "Continue the final capstone project from the previous working step.",
                helpConcept:
                    "The final capstone is progressive. Each step starts from the previous working solution and adds one focused feature.",
            };
        }

        return {
            preferredProjectExerciseKind: "code_input",
            minStepCount: 3,
            targetStepCount: 3,
            allowReveal: true,
            tryItDefault: {
                enabled: true,
                sketchIndex: 0,
                allowReveal: true,
            },
            projectFlowDefault: "progressive",
            projectTitle: "Module Project",
            projectStepLabel: "Project step",
            startPromptPrefix: "Start the module project.",
            continuePromptPrefix:
                "Continue the same module project from the previous working step.",
            helpConcept:
                "This module project is progressive. Each step starts from the previous working solution and adds one focused feature.",
        };
    },
    isProjectExercise(args) {
        return args.exercise.kind === "code_input";
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
    allowedRecipeTypes: ["fixed_tests", "template_io", "semantic", "shell_task"],
    buildModuleRuntimeDefaults() {
        return { kind: "code", language: "python" };
    },
    practice: {
        tryItDefault: {
            enabled: true,
            sketchIndex: 0,
            allowReveal: true,
        },
        preferredTryItExerciseKind: "code_input",
    },
    project: pythonProjectCapability,
    renderExerciseKindPromptRules(args) {
        const introTopicHaystack = `${args.seed.title} ${args.seed.summary}`.toLowerCase();
        const looksLikeIntroTopic =
            args.seed.moduleOrder === 1 &&
            (
                args.seed.technical === false ||
                /\b(intro|introduction|setup|first program|running|output panel|get started)\b/.test(
                    introTopicHaystack,
                )
            );
        const lines = [
            '- For Python code_input, prefer recipeType "fixed_tests" when the exercise is a normal runnable program.',
            `- For Python code_input using fixed_tests, include at least ${PYTHON_MINIMUM_FIXED_TESTS} meaningful and distinct stdin/stdout tests.`,
            "- Distinct means the tests must check different behavior or different input values, not duplicate the same case twice.",
            "- For stdin-based Python code_input, use at least two different stdin values.",
            "- Do not create fixed_tests code_input exercises that only print one fixed literal and do not read stdin.",
            "- For static output concepts, use single_choice, fill_blank_choice, or drag_reorder instead of code_input.",
            "- If you cannot write at least two meaningful fixed tests, replace the exercise with a non-code exercise or use semantic checks only when structure/behavior truly requires it.",
            '- For nested data structures like a list of dictionaries, use argKinds: ["list_of_dict_entries"] or expectedKind: "list_of_dict_entries" as needed.',
            '- For Python code_input, use recipeType "fixed_tests" only when the exercise is a normal runnable program that reads stdin and/or prints exact output.',
            '- For Python code_input, use recipeType "semantic" for function-return tasks, class/object tasks, method tasks, attribute checks, local-scope tasks, and algorithm/data-transformation tasks.',
            '- For function-return exercises, include semanticChecks[] with type "function_returns"; do not create stdin/stdout wrappers with ast.literal_eval or _parse_arg.',
            '- For dictionary return values in semanticChecks, encode the dictionary as [["key", value]] pairs and set expectedKind: "dict_entries".',
            '- For dictionary arguments in semanticChecks.args, encode the dictionary as [["key", value]] pairs and set argKinds for that argument.',
            '- no_stdout is only an extra check; it must not be the only semantic check for a function-return or method-return exercise.',
            '- For fixed_tests exercises, solutionCode must be a complete runnable program that reads stdin when needed and prints the final answer.',
            '- For plain functions, never generate method_returns. Use function_returns with functionName, args, and expected.',
            '- For method_returns, always include className, constructorArgs, methodName, methodArgs, and expected.',
            "- File fixture exercises should not include input() unless the tests provide stdin. Prefer either stdin-based tests or file-based tests, not both.",
            '- For semantic function tasks, keep parameter-dependent logic inside the function body, not above the def line.',

        ];

        const supportsFilesystem =
            args.seed.workspacePolicy?.workspace.capabilities?.filesystem.enabled === true;

        if (supportsFilesystem) {
            lines.push(
                "- When the workspace supports files, Python code_input may use open(...), pathlib, and simple relative file paths.",
                "- Every file I/O exercise must include the exact fixture files the code reads or updates.",
                "- Keep exercise-level files[] as the learner-visible default fixture set for file lessons.",
                "- If different fixed tests expect different file contents, put the matching files under each tests[].files entry instead of using stdin to vary file contents.",
                "- Do not reference files that are not provided by the exercise fixtures.",
                "- Keep fixture contents short and deterministic.",
                "- Online editor files support nested folders through workspace-relative POSIX paths.",
                "- Use paths such as data/input.txt, src/main.py, helpers/utils.py, and tests/test_main.py.",
                "- Do not use absolute paths, backslashes, drive letters, ../, or empty path segments.",
                "- Function basics should usually stay single-file main.py exercises.",
                "- Use provided starterFiles for small modularity exercises such as main.py plus helpers.py, or src/main.py plus src/helpers/formatting.py.",
                "- starterFiles may include learner-editable files such as src/main.py or helpers/utils.py.",
                "- files and tests[].files may include fixture files such as data/input.txt or data/students.csv.",
                "- Set entryFilePath when the learner entry file is not main.py, for example entryFilePath: \"src/main.py\".",
                "- Do not ask learners to create new folders/files in normal graded exercises unless workspaceExpectations or equivalent required-path validation is available.",
                "- If the exercise needs a helper module but the checker cannot validate newly created files, provide that helper file in starterFiles and ask the learner to edit it.",
                "- If asking the learner to create files/folders, explicitly state the exact required path and only do this when createFiles/createFolders or filesystem capabilities are enabled.",
                "- File-based fixed_tests need at least two meaningful tests with different tests[].files contents, even when stdin is empty.",
                "- CSV file fixtures should contain only CSV text, such as `name,score\\nAva,9\\nBen,7\\n`.",
            );
        } else {
            lines.push(
                "- When the workspace does not support files, do not generate open(...), pathlib file access, or filesystem path exercises.",
            );
        }

        if (args.seed.technical === false || looksLikeIntroTopic) {
            lines.push(
                "- For conceptual Python topics, prefer single_choice, multi_choice, drag_reorder, and fill_blank_choice over code_input.",
                "- For conceptual Python topics, keep code_input to at most one exercise unless the topic explicitly teaches runnable code.",
                "- Do not turn intro/concept lessons into mostly code_input practice.",
            );
        }

        if (args.mode === "authoring") {
            lines.push(
                '- Never leave recipeType ambiguous for Python code_input exercises.',
                "- For beginner print/output prompts, avoid code_input unless you can write two meaningful validations.",
            );
        }

        return lines;
    },
    renderAuthoringPromptRules(args) {
        const lines = [
            "Python code_input self-check:",
            '- Use recipeType "semantic" when the learner must define a function, use parameters, return a value, define a class, create methods, set attributes, or implement algorithm/data-transformation behavior.',
            '- For semantic function exercises, include semanticChecks[] using type "function_returns".',
            '- Canonical function semantic check: {"type":"function_returns","functionName":"double_list","args":[[1,2,3]],"expected":[2,4,6]}.',

            '- For dictionary return values, do not emit raw JSON objects in semanticChecks.expected.',
            '- Encode dictionary expected values as arrays of [key, value] pairs and set expectedKind: "dict_entries".',
            '- Example dictionary return check: {"type":"function_returns","functionName":"make_profile","args":["Ava",12],"expected":[["name","Ava"],["age",12]],"expectedKind":"dict_entries"}.',
            '- For dictionary function arguments, encode the dictionary argument as [key, value] pairs and set argKinds for that argument.',
            '- Example dictionary argument check: {"type":"function_returns","functionName":"get_score","args":[[["score",7]]],"argKinds":["dict_entries"],"expected":7}.',
            '- A semantic return-value task must include at least one function_returns or method_returns check. no_stdout alone is not enough.',

            '- Do not use method_returns for plain functions. method_returns is only for class instance methods and must include className.',
            '- Canonical class semantic checks can use defines_class, constructible, instance_attributes, method_returns, created_instances, and printed_line_count.',
            '- printed_line_count uses min, not expected. Example: {"type":"printed_line_count","min":2}.',
            '- To require no printed output for return-value tasks, use {"type":"no_stdout"}.',
            '- For normal beginner input/print/output programs, set recipeType to "fixed_tests" and include tests[].',
            '- If recipeType is "semantic", do not include tests[] and do not rely on stdout.',
            '- If recipeType is "fixed_tests", do not include semanticChecks[].',
            `- If recipeType is "fixed_tests", include at least ${PYTHON_MINIMUM_FIXED_TESTS} meaningful stdin/stdout tests.`,
            '- Never expose hidden harness code such as import ast, _parse_arg, _inputs, or ast.literal_eval in starterCode or solutionCode.',

            "- For file-reading fixed_tests exercises, do not call input() unless every test provides stdin. If the exercise reads from a fixture file, get data from the file only.",
            "- Do not combine input() with open(...) in beginner file-reading exercises unless the prompt explicitly asks for both stdin and file input.",
            "- For fixed_tests file I/O exercises, tests must provide tests[].files fixtures for each case, and solutionCode must run with stdin: \"\".",

            "- For file-reading fixed_tests exercises, provide at least two tests. Each test must include its own tests[].files fixture with different file content and matching stdout.",
            "- Do not rely on stdin to vary file-reading exercises. Vary the fixture file content instead.",
            "- For CSV fixed_tests exercises, every tests[] case must include a CSV fixture file under tests[].files.",
            "- Do not put JSON syntax, closing brackets, or object delimiters such as `}]},{` inside fixture file content. Fixture content must be only the exact text that belongs inside the learner-visible file.",
            '- For semantic function exercises, starterCode and solutionCode must not contain top-level statements that use the function parameter before the function is called.',
            '- Do not put lines such as row = ..., parts = row.split(...), name = name.strip(), or score_text = score_text.strip() before def validate_row(row).',
            '- Put validation and cleaning logic inside the function body for function-return semantic exercises.',

            '- For function arguments that are a list of dictionaries, encode each dictionary as [key, value] pairs and set argKinds: ["list_of_dict_entries"].',
            '- Example list-of-dictionaries argument check: {"type":"function_returns","functionName":"total_stock","args":[[[["name","Pen"],["stock",4]],[["name","Book"],["stock",6]]]],"argKinds":["list_of_dict_entries"],"expected":10}.',
            '- For expected return values that are a list of dictionaries, encode them the same way and set expectedKind: "list_of_dict_entries".',
        ];

        const terminalAvailable =
            args.seed.workspacePolicy?.workspace.capabilities?.terminal.enabled === true;
        const supportsFilesystem =
            args.seed.workspacePolicy?.workspace.capabilities?.filesystem.enabled === true;

        if (supportsFilesystem) {
            lines.push(
                "- File I/O lessons may use open(...), read(), write(), or pathlib only when the exercise provides explicit fixture files.",
                "- Every file path used by the official solution must be present in the exercise files list unless the code creates that file during the exercise.",
                "- When different fixed tests need different file contents, store those fixtures under tests[].files and keep exercise-level files[] as the default learner-visible example.",
                "- Do not use stdin to vary file contents for file-reading exercises.",
                "- Prefer simple relative file names like data.txt, names.txt, and scores.csv.",
                "- Keep fixture contents short and deterministic, and avoid giant repeated blank lines.",
                "- Use semantic checks when the learner must define a function, use parameters, return a value, avoid print-only solutions, or demonstrate local scope.",
                "- Function basics should usually be single-file main.py exercises.",
                "- For modularity/refactoring exercises, prefer provided starterFiles over asking learners to create helper files from scratch.",
                "- If a project-style exercise asks learners to create files or folders, state the exact required paths and pair it with workspaceExpectations so grading can verify those paths.",
            );
        } else {
            lines.push(
                "- Do not use open(...), pathlib file access, or filesystem paths in lessons that do not support files.",
            );
        }

        if (!terminalAvailable) {
            lines.push(
                "- For Python browser-runner lessons, never mention Terminal, command line, shell, or console in learner-facing prompts, hints, options, explanations, or answer choices.",
                '- Use "code editor", "Run", and "output panel" for learner-facing workspace wording.',
                '- If a tool is unavailable in this lesson, say it is "not available in this lesson" without naming terminal-based workflows.',
                '- Do not use "Terminal" even as a multiple-choice distractor. Use a safe non-workspace distractor instead.',
            );
        }

        return lines;
    },
    codeInput: pythonCodeInputCapability,
    getRecipeRegistry() {
        return {};
    },
    validateTopicBundle() {
        return [];
    },
};
