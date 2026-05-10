import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationIssue } from "../../shared/profileServices.js";
import {
    scanTextBoundaries,
    type TextBoundarySource,
} from "../../shared/scanTextBoundaries.js";

const PYTHON_SQL_LEAK_RULES = [
    {
        code: "PYTHON_SQL_FENCE_LEAKAGE",
        severity: "error",
        pattern: /```sql|~~~sql/i,
        message:
            "Python course content contains a SQL code fence, which suggests cross-course leakage.",
    },
    {
        code: "PYTHON_SQL_QUERY_LEAKAGE",
        severity: "error",
        pattern:
            /\bselect\s+(?:\*|[a-z_][\w.]*|\w+\s*\([^)]*\))(?:\s*,\s*(?:[a-z_][\w.]*|\w+\s*\([^)]*\)))*\s+from\s+(?:[a-z_][\w.]*|"[^"]+"|`[^`]+`|\[[^\]]+\])/i,
        message:
            "Python course content contains SQL SELECT query syntax that belongs to SQL rather than Python.",
    },
    {
        code: "PYTHON_SQL_CLAUSE_LEAKAGE",
        severity: "error",
        pattern: /\bgroup\s+by\b|\border\s+by\b|\bwhere\s+clause\b/i,
        message:
            "Python course content mentions SQL clause terminology, which suggests prompt or sketch leakage from another course.",
    },
    {
        code: "PYTHON_SQL_MUTATION_LEAKAGE",
        severity: "error",
        pattern: /\bcreate\s+table\b|\binsert\s+into\b|\bdelete\s+from\b|\bupdate\s+[a-z_][a-z0-9_]*\s+set\b/i,
        message:
            "Python course content contains SQL mutation syntax instead of Python-focused instructions.",
    },
    {
        code: "PYTHON_SQL_NAMED_LEAKAGE",
        severity: "error",
        pattern: /\bsql\b|\bsqlite\b|\bpostgres(?:ql)?\b|\bmysql\b|\bdatabase\s+query\b|\bsql\s+query\b/i,
        message:
            "Python course content explicitly references SQL/database-query language, which should stay in the SQL profile.",
    },
] as const;

function collectPythonBoundarySources(draft: TopicAuthoringDraft): TextBoundarySource[] {
    const sources: TextBoundarySource[] = [
        { field: "title", text: draft.title },
        { field: "summary", text: draft.summary },
    ];

    for (const block of draft.sketchBlocks) {
        sources.push({
            field: `sketchBlocks.${block.id}.bodyMarkdown`,
            text: block.bodyMarkdown,
        });
    }

    for (const exercise of draft.quizDraft) {
        sources.push(
            {
                field: `quizDraft.${exercise.id}.prompt`,
                text: exercise.prompt,
                exerciseId: exercise.id,
            },
            {
                field: `quizDraft.${exercise.id}.hint`,
                text: exercise.hint,
                exerciseId: exercise.id,
            },
            {
                field: `quizDraft.${exercise.id}.help.concept`,
                text: exercise.help.concept,
                exerciseId: exercise.id,
            },
            {
                field: `quizDraft.${exercise.id}.help.hint_1`,
                text: exercise.help.hint_1,
                exerciseId: exercise.id,
            },
            {
                field: `quizDraft.${exercise.id}.help.hint_2`,
                text: exercise.help.hint_2,
                exerciseId: exercise.id,
            },
        );

        if (exercise.kind === "code_input") {
            sources.push(
                {
                    field: `quizDraft.${exercise.id}.starterCode`,
                    text: exercise.starterCode,
                    exerciseId: exercise.id,
                },
                {
                    field: `quizDraft.${exercise.id}.solutionCode`,
                    text: exercise.solutionCode,
                    exerciseId: exercise.id,
                },
            );
        }
    }

    return sources;
}

export function validatePythonPromptBoundary(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): {
    issues: SemanticValidationIssue[];
} {
    const matches = scanTextBoundaries({
        rules: [...PYTHON_SQL_LEAK_RULES],
        sources: collectPythonBoundarySources(args.draft),
    });

    return {
        issues: matches.map((match) => ({
            code: match.code,
            category: "prompt_intent",
            severity: match.severity,
            exerciseId: match.exerciseId,
            message: `${match.message} Found in "${match.field}".`,
        })),
    };
}
