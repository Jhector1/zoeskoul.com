import type {
    TopicAuthoringDraft,
    TopicSeed,
    WorkspaceLanguage,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationIssue } from "./profileServices.js";
import { isProjectLikeTopic } from "./isProjectLikeTopic.js";

type CodeInputDraft = Extract<
    TopicAuthoringDraft["quizDraft"][number],
    { kind: "code_input" }
>;

type FencedCodeBlock = {
    language: string;
    code: string;
    sketchId: string;
    sketchTitle: string;
};

const SQL_FENCE_LANGUAGES = new Set(["", "sql", "sqlite"]);
const RESERVED_SQL_ALIAS_WORDS = new Set([
    "on",
    "where",
    "left",
    "right",
    "full",
    "inner",
    "outer",
    "cross",
    "join",
    "group",
    "order",
    "having",
    "limit",
    "union",
]);

function extractFencedCodeBlocks(
    sketchBlocks: TopicAuthoringDraft["sketchBlocks"],
): FencedCodeBlock[] {
    const blocks: FencedCodeBlock[] = [];
    const fencePattern = /```([a-zA-Z0-9_-]*)[^\S\r\n]*\r?\n([\s\S]*?)```/g;

    for (const sketch of sketchBlocks) {
        const markdown = String(sketch.bodyMarkdown ?? "");
        for (const match of markdown.matchAll(fencePattern)) {
            blocks.push({
                language: String(match[1] ?? "").trim().toLowerCase(),
                code: String(match[2] ?? ""),
                sketchId: String(sketch.id ?? "unknown-sketch"),
                sketchTitle: String(sketch.title ?? sketch.id ?? "worked example"),
            });
        }
    }

    return blocks;
}

function normalizeWhitespace(value: unknown): string {
    return String(value ?? "")
        .replace(/\r\n?/g, "\n")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .join(" ");
}

function stripSqlComments(value: string): string {
    return value
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/--[^\n]*/g, " ");
}

function normalizeSqlAliasReferences(sql: string): string {
    const aliasPattern = /\b(from|left\s+join|right\s+join|full\s+join|inner\s+join|cross\s+join|join)\s+([a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/gi;
    const aliases = new Map<string, string>();

    for (const match of sql.matchAll(aliasPattern)) {
        const table = String(match[2] ?? "").toLowerCase();
        const alias = String(match[3] ?? "").toLowerCase();
        if (alias && !RESERVED_SQL_ALIAS_WORDS.has(alias)) {
            aliases.set(alias, table);
        }
    }

    let normalized = sql;
    for (const [alias, table] of [...aliases.entries()].sort(
        ([left], [right]) => right.length - left.length,
    )) {
        normalized = normalized.replace(
            new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\.`, "g"),
            `${table}.`,
        );
    }

    return normalized.replace(aliasPattern, (whole, joinKind, table, alias) => {
        const normalizedAlias = String(alias ?? "").toLowerCase();
        if (!normalizedAlias || RESERVED_SQL_ALIAS_WORDS.has(normalizedAlias)) {
            return whole;
        }
        return `${joinKind} ${table}`;
    });
}

/**
 * Produces a conservative SQL result-expectation fingerprint.
 *
 * Cosmetic differences such as formatting, capitalization, INNER versus JOIN,
 * output aliases, and ORDER BY do not make a Try It different from a worked
 * example. Meaningful changes to selected values, relationships, filters,
 * grouping, or aggregates remain visible in the fingerprint.
 */
export function buildSqlExpectationFingerprint(value: unknown): string {
    let sql = stripSqlComments(String(value ?? ""))
        .toLowerCase()
        .trim()
        .replace(/;+\s*$/g, "");

    sql = sql.replace(/\border\s+by\b[\s\S]*$/i, "");
    sql = sql.replace(/\blimit\b[\s\S]*$/i, "");
    sql = normalizeSqlAliasReferences(sql);
    sql = sql.replace(/\binner\s+join\b/g, "join");

    const selectMatch = /^\s*select\s+([\s\S]*?)\s+from\s+([\s\S]*)$/i.exec(sql);
    if (selectMatch) {
        const selectList = String(selectMatch[1] ?? "").replace(
            /\s+as\s+[a-z_][a-z0-9_]*(?=\s*,|\s*$)/gi,
            "",
        );
        sql = `select ${selectList} from ${String(selectMatch[2] ?? "")}`;
    }

    return normalizeWhitespace(sql);
}

function normalizeLanguage(value: unknown): string {
    const language = String(value ?? "").trim().toLowerCase();
    if (language === "py") return "python";
    if (language === "sh" || language === "shell") return "bash";
    return language;
}

function fenceMatchesExercise(args: {
    profileId: string;
    fenceLanguage: string;
    exerciseLanguage?: WorkspaceLanguage;
}): boolean {
    const profileId = normalizeLanguage(args.profileId);
    const fenceLanguage = normalizeLanguage(args.fenceLanguage);
    const exerciseLanguage = normalizeLanguage(args.exerciseLanguage);

    if (profileId === "sql") {
        return SQL_FENCE_LANGUAGES.has(fenceLanguage);
    }

    if (!fenceLanguage || !exerciseLanguage) return true;
    return fenceLanguage === exerciseLanguage;
}

type ExerciseSolutionCandidate = {
    label: string;
    code: string;
};

function exerciseSolutionCandidates(
    exercise: CodeInputDraft,
): ExerciseSolutionCandidate[] {
    const candidates: ExerciseSolutionCandidate[] = [
        { label: "solutionCode", code: String(exercise.solutionCode ?? "") },
    ];

    for (const file of exercise.solutionFiles ?? []) {
        candidates.push({
            label: `solutionFiles/${file.path}`,
            code: String(file.content ?? ""),
        });
    }

    const seen = new Set<string>();
    return candidates.filter((candidate) => {
        const normalized = normalizeWhitespace(candidate.code);
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}

function exercisesDuplicate(args: {
    profileId: string;
    exampleCode: string;
    solutionCode: string;
}): boolean {
    const exactExample = normalizeWhitespace(args.exampleCode);
    const exactSolution = normalizeWhitespace(args.solutionCode);
    if (!exactExample || !exactSolution) return false;

    if (exactExample === exactSolution) return true;

    if (normalizeLanguage(args.profileId) === "sql") {
        return (
            buildSqlExpectationFingerprint(args.exampleCode) ===
            buildSqlExpectationFingerprint(args.solutionCode)
        );
    }

    return false;
}

export function validateWorkedExampleTryItDistinctness(args: {
    profileId: string;
    seed?: TopicSeed;
    draft: TopicAuthoringDraft;
}): SemanticValidationIssue[] {
    if (
        isProjectLikeTopic({ seed: args.seed, draft: args.draft }) ||
        args.seed?.practice?.conceptualOnly === true
    ) {
        return [];
    }

    const examples = extractFencedCodeBlocks(args.draft.sketchBlocks ?? []);
    if (examples.length === 0) return [];

    const codeInputs = (args.draft.quizDraft ?? []).filter(
        (exercise): exercise is CodeInputDraft => exercise?.kind === "code_input",
    );
    if (codeInputs.length === 0) return [];
    const issues: SemanticValidationIssue[] = [];

    for (const exercise of codeInputs) {
        let duplicate:
            | { example: FencedCodeBlock; candidate: ExerciseSolutionCandidate }
            | undefined;

        for (const example of examples) {
            if (
                !fenceMatchesExercise({
                    profileId: args.profileId,
                    fenceLanguage: example.language,
                    exerciseLanguage: exercise.fixedLanguage,
                })
            ) {
                continue;
            }

            for (const candidate of exerciseSolutionCandidates(exercise)) {
                if (
                    exercisesDuplicate({
                        profileId: args.profileId,
                        exampleCode: example.code,
                        solutionCode: candidate.code,
                    })
                ) {
                    duplicate = { example, candidate };
                    break;
                }
            }

            if (duplicate) break;
        }

        if (!duplicate) continue;

        issues.push({
            code: "WORKED_EXAMPLE_TRY_IT_DUPLICATE",
            category: "pedagogy",
            severity: "error",
            exerciseId: exercise.id,
            message:
                `Try It exercise "${exercise.id}" reproduces the worked example in ` +
                `"${duplicate.example.sketchTitle}" (${duplicate.example.sketchId}) through ` +
                `${duplicate.candidate.label}. Change a meaningful expectation such as the requested ` +
                `output, source entity, filter, aggregate, input, inserted/updated values, or ` +
                `relationship path. Formatting, capitalization, aliases, and ORDER BY alone do ` +
                `not make it a different exercise.`,
        });
    }

    return issues;
}
