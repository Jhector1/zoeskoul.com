import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticCheck } from "@zoeskoul/practice-checks";
import type {
    SemanticValidationIssue,
    SemanticValidationReport,
} from "../../shared/profileServices.js";
import { makeEmptySemanticValidationReport } from "../../shared/noopReports.js";
import { validateProgrammingTeachingSketches } from "../../shared/validateProgrammingTeachingSketches.js";
import { validatePythonPromptBoundary } from "./validatePythonPromptBoundary.js";

function extractDefinedFunctionNames(code: string): string[] {
    // Only top-level functions should count as function-return exercises.
    // Indented methods like `def get_info(self):` inside a class are class/method tasks,
    // not standalone function-return tasks.
    return Array.from(code.matchAll(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm))
        .map((match) => String(match[1] ?? ""))
        .filter((name) => name && !name.startsWith("_"));
}
function hasParseArgHarness(code: string): boolean {
    return (
        /\bdef\s+_parse_arg\s*\(/.test(code) ||
        /\bast\.literal_eval\s*\(/.test(code) ||
        /\b_inputs\s*=\s*\[\]/.test(code) ||
        /while\s+True\s*:\s*\n\s*_inputs\.append\(input\(\)\)/.test(code)
    );
}

function looksLikeFunctionReturnExercise(args: {
    prompt: string;
    starterCode: string;
    solutionCode: string;
}): boolean {
    const prompt = args.prompt.toLowerCase();
    const starterCode = args.starterCode;
    const solutionCode = args.solutionCode;

    const starterFunctions = extractDefinedFunctionNames(starterCode);
    const solutionFunctions = extractDefinedFunctionNames(solutionCode);

    const hasFunction =
        starterFunctions.length > 0 ||
        solutionFunctions.length > 0 ||
        starterCode.trimStart().startsWith("def ");

    const promptSaysFunction =
        /\b(write|create|define|complete|implement)\s+(a\s+)?function\b/.test(
            prompt,
        ) ||
        /\breturn\b/.test(prompt) ||
        /\breturns?\b/.test(prompt);

    const starterSaysReturn =
        /#.*\breturn\b/i.test(starterCode) ||
        /\bpass\b/.test(starterCode);

    const solutionReturns = /\breturn\b/.test(solutionCode);

    return hasFunction && (promptSaysFunction || starterSaysReturn || solutionReturns);
}

function solutionLooksLikeRunnableStdoutProgram(solutionCode: string): boolean {
    return (
        /\bprint\s*\(/.test(solutionCode) ||
        /\binput\s*\(/.test(solutionCode) ||
        /\bopen\s*\(/.test(solutionCode) ||
        /\bPath\s*\(/.test(solutionCode)
    );
}

function semanticChecksContainFunctionReturn(
    semanticChecks: SemanticCheck[],
    functionNames: string[],
): boolean {
    if (!functionNames.length) {
        return semanticChecks.some((check) => check.type === "function_returns");
    }

    return semanticChecks.some(
        (check) =>
            check.type === "function_returns" &&
            functionNames.includes(check.functionName),
    );
}

function semanticChecksContainClassCheck(semanticChecks: SemanticCheck[]): boolean {
    return semanticChecks.some((check) =>
        [
            "defines_class",
            "constructible",
            "instance_attributes",
            "method_returns",
            "created_instances",
        ].includes(check.type),
    );
}

function validatePythonExerciseShape(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): {
    issues: SemanticValidationIssue[];
} {
    const issues: SemanticValidationIssue[] = [];

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "code_input") continue;

        const prompt = String(exercise.prompt ?? "");
        const starterCode = String(exercise.starterCode ?? "");
        const solutionCode = String(exercise.solutionCode ?? "");
        const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
        const semanticChecks = Array.isArray(exercise.semanticChecks)
            ? (exercise.semanticChecks as SemanticCheck[])
            : [];

        const isSemanticRecipe = exercise.recipeType === "semantic";
        const isFixedTestsRecipe = exercise.recipeType === "fixed_tests";

        const functionNames = Array.from(
            new Set([
                ...extractDefinedFunctionNames(starterCode),
                ...extractDefinedFunctionNames(solutionCode),
            ]),
        );

        const functionReturnExercise = looksLikeFunctionReturnExercise({
            prompt,
            starterCode,
            solutionCode,
        });

        const parseArgInVisibleCode =
            hasParseArgHarness(starterCode) || hasParseArgHarness(solutionCode);

        const booleanOnlyOutputs =
            tests.length > 0 &&
            tests.every((test) => {
                const out = String(test.stdout ?? "").trim().toLowerCase();
                return out === "true" || out === "false";
            });

        const expectsNamedStringOutputs =
            /'eligible'|'not eligible'|'positive'|'negative'|'zero'|'a'|'b'|'c'|'f'/i.test(
                prompt,
            ) ||
            /print\('(?:Eligible|Not eligible|Positive|Negative|Zero|A|B|C|F)'\)|print\("(?:Eligible|Not eligible|Positive|Negative|Zero|A|B|C|F)"\)/.test(
                solutionCode,
            );

        if (exercise.recipeType === "sql_query") {
            issues.push({
                code: "PYTHON_SQL_RECIPE_FORBIDDEN",
                category: "behavior",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" uses recipeType "sql_query", which is not allowed in the Python profile.`,
            });
        }

        if (exercise.datasetId) {
            issues.push({
                code: "PYTHON_DATASET_ID_FORBIDDEN",
                category: "behavior",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" sets datasetId="${exercise.datasetId}" inside the Python profile.`,
            });
        }

        if (exercise.checkSql?.trim()) {
            issues.push({
                code: "PYTHON_CHECK_SQL_FORBIDDEN",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" sets checkSql inside the Python profile.`,
            });
        }

        if (!exercise.recipeType) {
            issues.push({
                code: "PYTHON_RECIPE_TYPE_REQUIRED",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" must explicitly set recipeType to "semantic" or "fixed_tests".`,
            });
        }

        if (isSemanticRecipe && semanticChecks.length < 1) {
            issues.push({
                code: "PYTHON_SEMANTIC_CHECKS_MISSING",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" is marked semantic but is missing semantic checks.`,
            });
        }

        if (isSemanticRecipe && tests.length > 0) {
            issues.push({
                code: "PYTHON_SEMANTIC_WITH_STDOUT_TESTS",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" is marked semantic but also includes fixed stdout tests. Remove tests[] and use semanticChecks[] only.`,
            });
        }

        if (isFixedTestsRecipe && semanticChecks.length > 0) {
            issues.push({
                code: "PYTHON_FIXED_TESTS_WITH_SEMANTIC_CHECKS",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" is marked fixed_tests but also includes semanticChecks[]. Use recipeType "semantic" or remove semanticChecks[].`,
            });
        }

        if (isFixedTestsRecipe && tests.length < 1) {
            issues.push({
                code: "PYTHON_TESTS_MISSING",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" is missing programming tests. fixed_tests exercises must include tests[].`,
            });
        }

        if (
            functionReturnExercise &&
            isFixedTestsRecipe &&
            tests.length > 0 &&
            !solutionLooksLikeRunnableStdoutProgram(solutionCode)
        ) {
            issues.push({
                code: "PYTHON_FUNCTION_STDOUT_MISMATCH",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" defines a function that returns a value, but its fixed stdout tests expect printed output. Use semantic function_returns checks, or rewrite the solution as a runnable stdin/stdout program that prints.`,
            });
        }

        if (
            isSemanticRecipe &&
            functionReturnExercise &&
            !semanticChecksContainFunctionReturn(semanticChecks, functionNames) &&
            !semanticChecksContainClassCheck(semanticChecks)
        ) {
            issues.push({
                code: "PYTHON_FUNCTION_RETURNS_CHECK_MISSING",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" is a function-return task but semanticChecks[] does not include a function_returns check for ${functionNames.join(", ") || "the target function"}.`,
            });
        }

        if (parseArgInVisibleCode) {
            issues.push({
                code: "PYTHON_PARSE_ARG_HARNESS_FORBIDDEN",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" exposes _parse_arg / ast.literal_eval harness code. Function-return tasks should use semantic function_returns checks, not visible stdin parsing wrappers.`,
            });
        }

        if (isFixedTestsRecipe && !solutionLooksLikeRunnableStdoutProgram(solutionCode)) {
            issues.push({
                code: "PYTHON_FIXED_TESTS_NEED_RUNNABLE_OUTPUT",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" uses fixed_tests, but solutionCode does not look like a runnable program with observable output. Use semantic checks for return-value tasks.`,
            });
        }

        if (booleanOnlyOutputs && expectsNamedStringOutputs) {
            issues.push({
                code: "PYTHON_PLACEHOLDER_BOOLEAN_TESTS_MISMATCH",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" uses placeholder True/False stdout tests, but the prompt/solution expects named string outputs such as Eligible, A/B/C/F, or similar labels.`,
            });
        }
    }

    return { issues };
}

export async function validatePythonSemantic(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<SemanticValidationReport> {
    const report = makeEmptySemanticValidationReport(args.seed.topicId);
    const shape = validatePythonExerciseShape(args);
    const boundary = validatePythonPromptBoundary(args);
    const pedagogy = validateProgrammingTeachingSketches({
        profileId: "python",
        draft: args.draft,
    });

    report.issues.push(...shape.issues, ...boundary.issues, ...pedagogy);
    report.ok = !report.issues.some((issue) => issue.severity === "error");

    return report;
}