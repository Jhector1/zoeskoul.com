// packages/curriculum-profiles/src/sql/semantic/validateSqlPromptIntent.ts

import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationIssue } from "../../shared/profileServices.js";

function normalize(text: string | undefined): string {
    return (text ?? "").trim().toLowerCase();
}

function has(value: string, pattern: RegExp): boolean {
    return pattern.test(value);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Hard error only when the prompt explicitly asks for the SQL function.
 *
 * Examples that should error if missing:
 * - "Use SUM(...)"
 * - "Write a query using SUM"
 * - "Use COUNT to count rows"
 * - "Calculate with AVG(...)"
 *
 * Examples that should only warn:
 * - "total sales"
 * - "average sale amount"
 * - "how many rows"
 */
function explicitlyRequiresFunction(prompt: string, fn: string): boolean {
    const escaped = escapeRegExp(fn);

    return (
        has(prompt, new RegExp(`\\buse\\s+${escaped}\\s*\\(?`, "i")) ||
        has(prompt, new RegExp(`\\busing\\s+${escaped}\\s*\\(?`, "i")) ||
        has(prompt, new RegExp(`\\bwith\\s+${escaped}\\s*\\(?`, "i")) ||
        has(prompt, new RegExp(`\\bwrite\\s+.*\\b${escaped}\\b`, "i")) ||
        has(prompt, new RegExp(`\\bquery\\s+.*\\b${escaped}\\b`, "i")) ||
        has(prompt, new RegExp(`\\b${escaped}\\s*\\(`, "i"))
    );
}

function mentionsCountIntent(prompt: string): boolean {
    return (
        has(prompt, /\bhow many\b/i) ||
        has(prompt, /\bnumber of\b/i) ||
        has(prompt, /\btotal number of\b/i) ||
        has(prompt, /\bcount\b/i) ||
        has(prompt, /\bcounts\b/i)
    );
}

function mentionsAvgIntent(prompt: string): boolean {
    return (
        has(prompt, /\baverage\b/i) ||
        has(prompt, /\bavg\b/i) ||
        has(prompt, /\bmean\b/i)
    );
}

function mentionsSumIntent(prompt: string): boolean {
    return (
        has(prompt, /\bsum\b/i) ||
        has(prompt, /\bsums\b/i) ||
        has(
            prompt,
            /\b(?:total|totals)\s+(?:amount|amounts|price|prices|cost|costs|sale|sales|revenue|revenues|stock|stocks|quantity|quantities|value|values|score|scores|number|numbers|count|counts)\b/i,
        ) ||
        has(
            prompt,
            /\b(?:amount|amounts|price|prices|cost|costs|sale|sales|revenue|revenues|stock|stocks|quantity|quantities|value|values|score|scores|number|numbers|count|counts)\s+(?:total|totals)\b/i,
        ) ||
        has(prompt, /\badd up\b/i) ||
        has(prompt, /\bcombined\b/i)
    );
}

function hasAggregateLikeIntent(prompt: string): boolean {
    return (
        explicitlyRequiresFunction(prompt, "count") ||
        explicitlyRequiresFunction(prompt, "sum") ||
        explicitlyRequiresFunction(prompt, "avg") ||
        explicitlyRequiresFunction(prompt, "average") ||
        mentionsCountIntent(prompt) ||
        mentionsAvgIntent(prompt) ||
        mentionsSumIntent(prompt)
    );
}

function mentionsGroupByIntent(prompt: string): boolean {
    return (
        has(prompt, /\bgroup\s+by\b/i) ||
        has(prompt, /\bgrouped\s+by\b/i) ||
        has(prompt, /\bgroup\s+(?:rows|records)\s+by\b/i) ||
        ((has(prompt, /\bper\s+\w+/i) ||
            has(prompt, /\bfor\s+each\b/i) ||
            has(prompt, /\bone\s+row\s+for\s+each\b/i) ||
            has(prompt, /\binside\s+each\b/i)) &&
            hasAggregateLikeIntent(prompt))
    );
}

function explicitlyRequiresGroupBy(prompt: string): boolean {
    return (
        has(prompt, /\buse\s+group\s+by\b/i) ||
        has(prompt, /\busing\s+group\s+by\b/i) ||
        has(prompt, /\bwith\s+group\s+by\b/i) ||
        has(prompt, /\bgroup\s+by\s+clause\b/i)
    );
}

function explicitlyRequiresHaving(prompt: string): boolean {
    return (
        has(prompt, /\buse\s+having\b/i) ||
        has(prompt, /\busing\s+having\b/i) ||
        has(prompt, /\bwith\s+having\b/i) ||
        has(prompt, /\bhaving\s+clause\b/i)
    );
}

function mentionsHavingIntent(prompt: string): boolean {
    return has(prompt, /\bhaving\b/i);
}

function explicitlyRequiresJoin(prompt: string): boolean {
    return (
        has(prompt, /\buse\s+\w*\s*join\b/i) ||
        has(prompt, /\busing\s+\w*\s*join\b/i) ||
        has(prompt, /\bwith\s+\w*\s*join\b/i) ||
        has(prompt, /\bjoin\s+clause\b/i)
    );
}

function mentionsJoinIntent(prompt: string): boolean {
    return (
        has(prompt, /\bjoin\b/i) ||
        has(prompt, /\bcombine\s+tables\b/i) ||
        has(prompt, /\bmultiple\s+tables\b/i) ||
        has(prompt, /\btwo\s+tables\b/i)
    );
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

        if (!prompt || !sql) continue;

        const explicitlyNeedsGroupBy = explicitlyRequiresGroupBy(prompt);
        const mentionsGroupBy = mentionsGroupByIntent(prompt);

        if (explicitlyNeedsGroupBy && !has(sql, /\bgroup\s+by\b/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_GROUP_BY_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    "Prompt explicitly requires GROUP BY, but the solution query does not contain GROUP BY.",
            });
        } else if (mentionsGroupBy && !has(sql, /\bgroup\s+by\b/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_GROUP_BY_WEAK_MISMATCH",
                category: "prompt_intent",
                severity: "warn",
                exerciseId: exercise.id,
                message:
                    "Prompt mentions grouping-like wording, but the solution query does not contain GROUP BY.",
            });
        }

        const explicitlyNeedsCount = explicitlyRequiresFunction(prompt, "count");
        const mentionsCount = mentionsCountIntent(prompt);

        if (explicitlyNeedsCount && !has(sql, /\bcount\s*\(/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_COUNT_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    "Prompt explicitly requires COUNT, but the solution query does not use COUNT(...).",
            });
        } else if (mentionsCount && !has(sql, /\bcount\s*\(/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_COUNT_WEAK_MISMATCH",
                category: "prompt_intent",
                severity: "warn",
                exerciseId: exercise.id,
                message:
                    "Prompt mentions count-like wording, but the solution query does not use COUNT(...).",
            });
        }

        const explicitlyNeedsAvg = explicitlyRequiresFunction(prompt, "avg");
        const explicitlyNeedsAverage = explicitlyRequiresFunction(prompt, "average");
        const mentionsAvg = mentionsAvgIntent(prompt);

        if (
            (explicitlyNeedsAvg || explicitlyNeedsAverage) &&
            !has(sql, /\bavg\s*\(/i)
        ) {
            issues.push({
                code: "SQL_PROMPT_INTENT_AVG_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    "Prompt explicitly requires AVG, but the solution query does not use AVG(...).",
            });
        } else if (mentionsAvg && !has(sql, /\bavg\s*\(/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_AVG_WEAK_MISMATCH",
                category: "prompt_intent",
                severity: "warn",
                exerciseId: exercise.id,
                message:
                    "Prompt mentions average-like wording, but the solution query does not use AVG(...).",
            });
        }

        const explicitlyNeedsSum = explicitlyRequiresFunction(prompt, "sum");
        const mentionsSum = mentionsSumIntent(prompt);

        if (explicitlyNeedsSum && !has(sql, /\bsum\s*\(/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_SUM_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    "Prompt explicitly requires SUM, but the solution query does not use SUM(...).",
            });
        } else if (mentionsSum && !has(sql, /\bsum\s*\(/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_SUM_WEAK_MISMATCH",
                category: "prompt_intent",
                severity: "warn",
                exerciseId: exercise.id,
                message:
                    "Prompt mentions total/sum-like wording, but the solution query does not use SUM(...).",
            });
        }

        const explicitlyNeedsHaving = explicitlyRequiresHaving(prompt);
        const mentionsHaving = mentionsHavingIntent(prompt);

        if (explicitlyNeedsHaving && !has(sql, /\bhaving\b/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_HAVING_MISSING",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    "Prompt explicitly requires HAVING, but the solution query does not use HAVING.",
            });
        } else if (mentionsHaving && !has(sql, /\bhaving\b/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_HAVING_WEAK_MISMATCH",
                category: "prompt_intent",
                severity: "warn",
                exerciseId: exercise.id,
                message:
                    "Prompt mentions HAVING-like wording, but the solution query does not use HAVING.",
            });
        }

        const explicitlyNeedsJoin = explicitlyRequiresJoin(prompt);
        const mentionsJoin = mentionsJoinIntent(prompt);

        if (explicitlyNeedsJoin && !has(sql, /\bjoin\b/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_JOIN_MISSING",
                category: "join",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    "Prompt explicitly requires JOIN, but the solution query does not use JOIN.",
            });
        } else if (mentionsJoin && !has(sql, /\bjoin\b/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_JOIN_WEAK_MISMATCH",
                category: "join",
                severity: "warn",
                exerciseId: exercise.id,
                message:
                    "Prompt mentions join-like wording, but the solution query does not use JOIN.",
            });
        }

        if (has(prompt, /\bat\s+least\b/i) && !has(sql, />=\s*\d+/i)) {
            issues.push({
                code: "SQL_PROMPT_INTENT_AT_LEAST_MISSING_GTE",
                category: "prompt_intent",
                severity: "warn",
                exerciseId: exercise.id,
                message:
                    "Prompt suggests an 'at least' condition, but the solution query does not clearly use >=.",
            });
        }
    }

    return { issues };
}
