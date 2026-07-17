import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationIssue } from "../../shared/profileServices.js";

type CodeInputDraft = Extract<
    TopicAuthoringDraft["quizDraft"][number],
    { kind: "code_input" }
>;

function moduleNumber(seed: TopicSeed): number {
    return Math.max(0, seed.moduleNumber ?? (seed.moduleOrder ?? 1) - 1);
}

function normalizeSql(value: unknown): string {
    return String(value ?? "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/--[^\n]*/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/;+$/g, "")
        .trim();
}

function fileContent(
    exercise: CodeInputDraft,
    group: "starterFiles" | "solutionFiles",
    path: string,
): string {
    return String(
        exercise[group]?.find((file) => file.path === path)?.content ?? "",
    );
}

function issue(
    code: string,
    exerciseId: string,
    message: string,
): SemanticValidationIssue {
    return {
        code,
        category: "pedagogy",
        severity: "error",
        exerciseId,
        message,
    };
}

export function validateSqlDataManagementSchemaPractice(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): SemanticValidationIssue[] {
    if (
        args.seed.courseSlug !== "sql-data-management" ||
        moduleNumber(args.seed) !== 2
    ) {
        return [];
    }

    const issues: SemanticValidationIssue[] = [];

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "code_input") continue;
        if ((exercise.recipeType ?? "sql_query") !== "sql_query") continue;

        const starterSchema = fileContent(exercise, "starterFiles", "schema.sql");
        const solutionSchema = fileContent(exercise, "solutionFiles", "schema.sql");
        const starterQuery = fileContent(exercise, "starterFiles", "query.sql");
        const solutionQuery = fileContent(exercise, "solutionFiles", "query.sql");

        if (exercise.entryFilePath !== "schema.sql") {
            issues.push(issue(
                "SQL_SCHEMA_PRACTICE_ENTRY_FILE",
                exercise.id,
                `Module 2 exercise "${exercise.id}" must open schema.sql first so the learner creates or changes the table before inspecting it.`,
            ));
        }

        if (!starterSchema || !solutionSchema) {
            issues.push(issue(
                "SQL_SCHEMA_PRACTICE_FILES_MISSING",
                exercise.id,
                `Module 2 exercise "${exercise.id}" must include schema.sql in both starterFiles and solutionFiles.`,
            ));
        } else if (normalizeSql(starterSchema) === normalizeSql(solutionSchema)) {
            issues.push(issue(
                "SQL_SCHEMA_STARTER_ALREADY_SOLVED",
                exercise.id,
                `Module 2 exercise "${exercise.id}" already provides the completed schema.sql answer. Leave real table or constraint work for the learner.`,
            ));
        }

        if (!/\bcreate\s+table\b/i.test(solutionSchema)) {
            issues.push(issue(
                "SQL_SCHEMA_SOLUTION_CREATE_TABLE_MISSING",
                exercise.id,
                `Module 2 exercise "${exercise.id}" must create or redefine a table in solutionFiles/schema.sql.`,
            ));
        }

        if (!starterQuery || !solutionQuery) {
            issues.push(issue(
                "SQL_SCHEMA_QUERY_FILES_MISSING",
                exercise.id,
                `Module 2 exercise "${exercise.id}" must include query.sql starter and solution files.`,
            ));
        } else if (normalizeSql(starterQuery) === normalizeSql(solutionQuery)) {
            issues.push(issue(
                "SQL_SCHEMA_QUERY_STARTER_ALREADY_SOLVED",
                exercise.id,
                `Module 2 exercise "${exercise.id}" must leave the inspection query for the learner.`,
            ));
        }

        if (!/\b(?:select|pragma)\b/i.test(solutionQuery)) {
            issues.push(issue(
                "SQL_SCHEMA_QUERY_RESULT_MISSING",
                exercise.id,
                `Module 2 exercise "${exercise.id}" must produce a learner-authored SELECT or PRAGMA in query.sql.`,
            ));
        }

        const prompt = String(exercise.prompt ?? "");
        if (!/schema\.sql/i.test(prompt) || !/query\.sql/i.test(prompt)) {
            issues.push(issue(
                "SQL_SCHEMA_FILE_EXPECTATIONS_UNCLEAR",
                exercise.id,
                `Module 2 exercise "${exercise.id}" must explain what the learner writes in schema.sql and query.sql.`,
            ));
        }
    }

    return issues;
}
