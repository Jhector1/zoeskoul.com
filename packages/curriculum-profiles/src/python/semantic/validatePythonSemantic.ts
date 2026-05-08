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

function validatePythonExerciseShape(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): {
    issues: SemanticValidationIssue[];
} {
    const issues: SemanticValidationIssue[] = [];

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "code_input") continue;

        const prompt = String(exercise.prompt ?? "").toLowerCase();
        const starterCode = String(exercise.starterCode ?? "");
        const solutionCode = String(exercise.solutionCode ?? "");
        const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
        const semanticChecks = Array.isArray(exercise.semanticChecks)
            ? (exercise.semanticChecks as SemanticCheck[])
            : [];
        const isSemanticRecipe = exercise.recipeType === "semantic";
        const looksLikeFunctionExercise =
            /\b(create|write|define)\s+a?\s*function\b/.test(prompt) ||
            /\breturn\b/.test(prompt) ||
            starterCode.trimStart().startsWith("def ");
        const usesStdoutTests =
            !isSemanticRecipe &&
            tests.some(
            (test) => typeof test.stdout === "string" && test.stdout.trim().length > 0,
        );
        const solutionPrints = /\bprint\s*\(/.test(solutionCode);
        const booleanOnlyOutputs =
            tests.length > 0 &&
            tests.every((test) => {
                const out = String(test.stdout ?? "").trim().toLowerCase();
                return out === "true" || out === "false";
            });
        const expectsNamedStringOutputs =
            /'eligible'|'not eligible'|'positive'|'negative'|'zero'|'a'|'b'|'c'|'f'/i.test(
                exercise.prompt,
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
                message:
                    `Exercise "${exercise.id}" uses recipeType "sql_query", which is not allowed in the Python profile.`,
            });
        }

        if (exercise.datasetId) {
            issues.push({
                code: "PYTHON_DATASET_ID_FORBIDDEN",
                category: "behavior",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    `Exercise "${exercise.id}" sets datasetId="${exercise.datasetId}" inside the Python profile.`,
            });
        }

        if (exercise.checkSql?.trim()) {
            issues.push({
                code: "PYTHON_CHECK_SQL_FORBIDDEN",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    `Exercise "${exercise.id}" sets checkSql inside the Python profile.`,
            });
        }

        if (isSemanticRecipe && semanticChecks.length < 1) {
            issues.push({
                code: "PYTHON_SEMANTIC_CHECKS_MISSING",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    `Exercise "${exercise.id}" is marked semantic but is missing semantic checks.`,
            });
        }

        if (!isSemanticRecipe && (!Array.isArray(exercise.tests) || exercise.tests.length < 1)) {
            issues.push({
                code: "PYTHON_TESTS_MISSING",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    `Exercise "${exercise.id}" is missing programming tests. Python code_input exercises must include at least one stdin/stdout test case.`,
            });
        }

        if (booleanOnlyOutputs && expectsNamedStringOutputs) {
            issues.push({
                code: "PYTHON_PLACEHOLDER_BOOLEAN_TESTS_MISMATCH",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    `Exercise "${exercise.id}" uses placeholder True/False stdout tests, but the prompt/solution expects named string outputs such as Eligible, A/B/C/F, or similar labels.`,
            });
        }

        if (looksLikeFunctionExercise && usesStdoutTests && !solutionPrints) {
            issues.push({
                code: "PYTHON_FUNCTION_STDOUT_MISMATCH",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    `Exercise "${exercise.id}" is authored like a function-return task, but its fixed tests expect stdout output and the solution never prints a result.`,
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
