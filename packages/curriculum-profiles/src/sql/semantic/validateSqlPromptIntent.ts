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

function hasPromptPhrase(prompt: string, pattern: RegExp) {
    return pattern.test(prompt);
}

function suggestsGroupByIntent(prompt: string): boolean {
    return (
        hasPromptPhrase(prompt, /\bgroup by\b/i) ||
        hasPromptPhrase(prompt, /\bgroup\b.*\bby\b/i) ||
        hasPromptPhrase(prompt, /\bgroup rows by\b/i) ||
        hasPromptPhrase(prompt, /\bgroup results by\b/i)
    );
}

function suggestsCountIntent(prompt: string): {
    explicit: boolean;
    strong: boolean;
    weak: boolean;
} {
    const explicit =
        hasPromptPhrase(prompt, /\bwrite\s+(?:a\s+)?sql\s+query\s+to\s+count\b/i) ||
        hasPromptPhrase(prompt, /\bwrite\s+(?:a\s+)?query\s+to\s+count\b/i) ||
        hasPromptPhrase(prompt, /\bcount the number of\b/i) ||
        hasPromptPhrase(prompt, /\bhow many\b/i) ||
        hasPromptPhrase(prompt, /\bnumber of rows\b/i) ||
        hasPromptPhrase(prompt, /\btotal number of rows\b/i) ||
        hasPromptPhrase(prompt, /\bcount rows\b/i);

    const strong =
        explicit ||
        hasPromptPhrase(prompt, /\bcount the\b/i) ||
        hasPromptPhrase(prompt, /\bcount only\b/i);

    const weak =
        hasPromptPhrase(prompt, /\bcount\b/i) &&
        !hasPromptPhrase(prompt, /\bcount\s*\(/i);

    return { explicit, strong, weak };
}

function suggestsAvgIntent(prompt: string): boolean {
    return (
        hasPromptPhrase(prompt, /\baverage\b/i) ||
        hasPromptPhrase(prompt, /\bavg\b/i)
    );
}

function suggestsSumIntent(prompt: string): {
    strong: boolean;
    weak: boolean;
} {
    return {
        strong:
            hasPromptPhrase(prompt, /\bsum\b/i) ||
            hasPromptPhrase(prompt, /\badd up\b/i) ||
            hasPromptPhrase(prompt, /\btotal up\b/i),
        weak:
            hasPromptPhrase(prompt, /\bgrand total\b/i),
    };
}

function suggestsHavingIntent(prompt: string): boolean {
    return hasPromptPhrase(prompt, /\bhaving\b/i);
}

function suggestsJoinIntent(prompt: string): boolean {
    return (
        hasPromptPhrase(prompt, /\bjoin\b/i) ||
        hasPromptPhrase(prompt, /\binner join\b/i) ||
        hasPromptPhrase(prompt, /\bleft join\b/i) ||
        hasPromptPhrase(prompt, /\bright join\b/i) ||
        hasPromptPhrase(prompt, /\bcombine tables\b/i) ||
        hasPromptPhrase(prompt, /\bfrom multiple tables\b/i)
    );
}

function suggestsAtLeastIntent(prompt: string): boolean {
    return hasPromptPhrase(prompt, /\bat least\b/i);
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

        if (suggestsGroupByIntent(prompt) && !has(sql, /\bgroup\s+by\b/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_GROUP_BY_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: "Prompt suggests GROUP BY, but the solution query does not contain GROUP BY.",
            });
        }

        const countIntent = suggestsCountIntent(prompt);
        if (countIntent.explicit && !has(sql, /\bcount\s*\(/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_COUNT_MISSING",
                category: "prompt_intent",
                severity: "warn",
                exerciseId: exercise.id,
                message: "Prompt explicitly asks for COUNT, but the solution query does not use COUNT(...).",
            });
        } else if (countIntent.strong && !has(sql, /\bcount\s*\(/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_COUNT_STRONG_MISMATCH",
                category: "prompt_intent",
                severity: "warn",
                exerciseId: exercise.id,
                message: "Prompt strongly suggests COUNT, but the solution query does not use COUNT(...).",
            });
        } else if (countIntent.weak && !has(sql, /\bcount\s*\(/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_COUNT_WEAK_MISMATCH",
                category: "prompt_intent",
                severity: "warn",
                exerciseId: exercise.id,
                message: "Prompt mentions count-like wording, but the solution query does not use COUNT(...).",
            });
        }

        if (suggestsAvgIntent(prompt) && !has(sql, /\bavg\s*\(/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_AVG_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: "Prompt suggests AVG, but the solution query does not use AVG(...).",
            });
        }

        const sumIntent = suggestsSumIntent(prompt);
        if (sumIntent.strong && !has(sql, /\bsum\s*\(/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_SUM_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: "Prompt suggests SUM, but the solution query does not use SUM(...).",
            });
        } else if (sumIntent.weak && !has(sql, /\bsum\s*\(/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_SUM_WEAK_MISMATCH",
                category: "prompt_intent",
                severity: "warn",
                exerciseId: exercise.id,
                message: "Prompt mentions total-like wording, but the solution query does not use SUM(...).",
            });
        }

        if (suggestsHavingIntent(prompt) && !has(sql, /\bhaving\b/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_HAVING_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: "Prompt suggests HAVING, but the solution query does not use HAVING.",
            });
        }

        if (suggestsJoinIntent(prompt) && !has(sql, /\bjoin\b/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_JOIN_MISSING",
                category: "join",
                severity: "error",
                exerciseId: exercise.id,
                message: "Prompt suggests joining tables, but the solution query does not use JOIN.",
            });
        }

        if (suggestsAtLeastIntent(prompt) && !has(sql, />=\s*\d+/i)) {
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