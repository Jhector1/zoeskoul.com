import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationIssue } from "../../shared/profileServices.js";

function normalize(text: string) {
    return text.trim().toLowerCase();
}

function has(sql: string, pattern: RegExp) {
    return pattern.test(sql);
}

export function validateSqlPromptIntent(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): {
    issues: SemanticValidationIssue[];
} {
    const issues: SemanticValidationIssue[] = [];

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "code_input") continue;
        if ((exercise.recipeType ?? "sql_query") !== "sql_query") continue;

        const prompt = normalize(exercise.prompt);
        const sql = normalize(exercise.solutionCode);

        if (!sql) continue;

        if (prompt.includes("group by") && !has(sql, /\bgroup\s+by\b/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_GROUP_BY_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: "Prompt suggests GROUP BY, but the solution query does not contain GROUP BY.",
            });
        }

        if (
            (prompt.includes("count") || prompt.includes("how many")) &&
            !has(sql, /\bcount\s*\(/i)
        ) {
            issues.push({
                code: "SQL_PROMPT_INTENT_COUNT_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: "Prompt suggests COUNT, but the solution query does not use COUNT(...).",
            });
        }

        if (
            (prompt.includes("average") || prompt.includes("avg")) &&
            !has(sql, /\bavg\s*\(/i)
        ) {
            issues.push({
                code: "SQL_PROMPT_INTENT_AVG_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: "Prompt suggests AVG, but the solution query does not use AVG(...).",
            });
        }

        if (
            (prompt.includes("sum") || prompt.includes("total")) &&
            !has(sql, /\bsum\s*\(/i)
        ) {
            issues.push({
                code: "SQL_PROMPT_INTENT_SUM_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: "Prompt suggests SUM or total, but the solution query does not use SUM(...).",
            });
        }

        if (prompt.includes("having") && !has(sql, /\bhaving\b/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_HAVING_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: "Prompt suggests HAVING, but the solution query does not use HAVING.",
            });
        }

        if (
            (prompt.includes("join") ||
                prompt.includes("combine tables") ||
                prompt.includes("multiple tables")) &&
            !has(sql, /\bjoin\b/i)
        ) {
            issues.push({
                code: "SQL_PROMPT_INTENT_JOIN_MISSING",
                category: "join",
                severity: "error",
                exerciseId: exercise.id,
                message: "Prompt suggests joining tables, but the solution query does not use JOIN.",
            });
        }

        if (prompt.includes("at least") && !has(sql, />=\s*\d+/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_AT_LEAST_MISSING_GTE",
                category: "prompt_intent",
                severity: "warn",
                exerciseId: exercise.id,
                message: "Prompt suggests an 'at least' condition, but the solution query does not clearly use >=.",
            });
        }
    }

    return { issues };
}