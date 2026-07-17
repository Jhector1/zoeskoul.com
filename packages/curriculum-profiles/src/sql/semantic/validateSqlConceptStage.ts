import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationIssue } from "../../shared/profileServices.js";
import { buildSqlDraftProgram } from "../shared/sqlWorkspace.js";
import { stripSqlCommentsAndStrings } from "../shared/sqlReferenceScan.js";

type ConceptRule = {
    concept: string;
    pattern: RegExp;
};

const SQL_CONCEPT_RULES: ConceptRule[] = [
    { concept: "SELECT", pattern: /\bselect\b/i },
    { concept: "FROM", pattern: /\bfrom\b/i },
    { concept: "WHERE", pattern: /\bwhere\b/i },
    { concept: "comparison_operators", pattern: /(?:>=|<=|<>|!=|=|>|<)/ },
    { concept: "AND", pattern: /\band\b/i },
    { concept: "OR", pattern: /\bor\b/i },
    { concept: "NOT", pattern: /\bnot\b/i },
    { concept: "ORDER BY", pattern: /\border\s+by\b/i },
    { concept: "ASC", pattern: /\basc\b/i },
    { concept: "DESC", pattern: /\bdesc\b/i },
    { concept: "LIMIT", pattern: /\blimit\b/i },
    { concept: "LIKE", pattern: /\blike\b/i },
    { concept: "IN", pattern: /\bin\s*\(/i },
    { concept: "NOT IN", pattern: /\bnot\s+in\s*\(/i },
    { concept: "BETWEEN", pattern: /\bbetween\b/i },
    { concept: "IS NULL", pattern: /\bis\s+null\b/i },
    { concept: "IS NOT NULL", pattern: /\bis\s+not\s+null\b/i },
    { concept: "INNER JOIN", pattern: /\binner\s+join\b/i },
    { concept: "LEFT JOIN", pattern: /\bleft(?:\s+outer)?\s+join\b/i },
    { concept: "RIGHT JOIN", pattern: /\bright(?:\s+outer)?\s+join\b/i },
    { concept: "FULL JOIN", pattern: /\bfull(?:\s+outer)?\s+join\b/i },
    { concept: "CROSS JOIN", pattern: /\bcross\s+join\b/i },
    { concept: "JOIN", pattern: /\bjoin\b/i },
    { concept: "GROUP BY", pattern: /\bgroup\s+by\b/i },
    { concept: "HAVING", pattern: /\bhaving\b/i },
    { concept: "INSERT", pattern: /\binsert\s+into\b/i },
    { concept: "UPDATE", pattern: /\bupdate\b/i },
    { concept: "DELETE", pattern: /\bdelete\s+from\b/i },
    { concept: "CREATE TABLE", pattern: /\bcreate\s+table\b/i },
];

const CANONICAL_SQL_CONCEPTS = [
    ...SQL_CONCEPT_RULES.map((rule) => rule.concept),
    "subquery",
] as const;

function conceptKey(concept: string): string {
    return concept
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");
}

const CANONICAL_CONCEPT_BY_KEY = new Map(
    CANONICAL_SQL_CONCEPTS.map((concept) => [conceptKey(concept), concept]),
);

function canonicalizeConcept(concept: string): string {
    const trimmed = concept.trim();
    return CANONICAL_CONCEPT_BY_KEY.get(conceptKey(trimmed)) ?? trimmed;
}

function detectConcepts(sql: string): string[] {
    const cleaned = stripSqlCommentsAndStrings(sql);
    const detected = new Set<string>();

    for (const rule of SQL_CONCEPT_RULES) {
        if (rule.pattern.test(cleaned)) {
            detected.add(rule.concept);
        }
    }

    if (/\(\s*select\b/i.test(cleaned)) {
        detected.add("subquery");
    }

    return [...detected];
}

function buildAllowedSet(seed: TopicSeed): Set<string> {
    const allowed = new Set<string>(
        (seed.authoringPolicy?.allowedConcepts ?? []).map(canonicalizeConcept),
    );
    const logicalModuleNumber = Math.max(0, (seed.moduleOrder ?? 1) - 1);
    const moduleAllowed =
        seed.authoringPolicy?.moduleRules?.[String(logicalModuleNumber)]?.allowedConcepts ?? [];

    for (const concept of moduleAllowed) {
        allowed.add(canonicalizeConcept(concept));
    }

    return allowed;
}

function buildDisallowedSet(seed: TopicSeed): Set<string> {
    const disallowed = new Set<string>(
        (seed.authoringPolicy?.disallowedConcepts ?? []).map(canonicalizeConcept),
    );
    const logicalModuleNumber = Math.max(0, (seed.moduleOrder ?? 1) - 1);
    const moduleDisallowed =
        seed.authoringPolicy?.moduleRules?.[String(logicalModuleNumber)]?.disallowedConcepts ?? [];

    for (const concept of moduleDisallowed) {
        disallowed.add(canonicalizeConcept(concept));
    }

    return disallowed;
}

export function validateSqlConceptStage(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): SemanticValidationIssue[] {
    const allowed = buildAllowedSet(args.seed);
    const disallowed = buildDisallowedSet(args.seed);
    const logicalModuleNumber = Math.max(0, (args.seed.moduleOrder ?? 1) - 1);
    const issues: SemanticValidationIssue[] = [];

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "code_input") continue;
        if ((exercise.recipeType ?? "sql_query") !== "sql_query") continue;

        const detected = detectConcepts(buildSqlDraftProgram(exercise, "solution"));
        if (detected.length === 0) continue;

        const futureConcepts = detected.filter((concept) => disallowed.has(concept));
        if (futureConcepts.length > 0) {
            issues.push({
                code: "SQL_FUTURE_CONCEPT",
                category: "pedagogy",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    `Exercise "${exercise.id}" uses future SQL concept(s) not allowed in module ${logicalModuleNumber}: ${futureConcepts.join(", ")}.`,
            });
            continue;
        }

        if (allowed.size === 0) continue;

        const unknownConcepts = detected.filter(
            (concept) => !allowed.has(concept) && !disallowed.has(concept),
        );

        if (unknownConcepts.length > 0) {
            issues.push({
                code: "SQL_UNPLANNED_CONCEPT",
                category: "pedagogy",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    `Exercise "${exercise.id}" uses SQL concept(s) outside the allowed concept stage for module ${logicalModuleNumber}: ${unknownConcepts.join(", ")}.`,
            });
        }
    }

    return issues;
}
