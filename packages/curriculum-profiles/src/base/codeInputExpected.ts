import type {
    ManifestComputedSpec,
    ManifestCodeInput,
    ManifestRecipe,
    ManifestSqlRuntimeDefaults,
    ManifestVarSpec,
} from "@zoeskoul/curriculum-contracts";
import {
    makeProgrammingExpected,
    makeSqlExpected,
    type ProgrammingCodeTest,
    type ProgrammingExpected,
    type SemanticCheck,
    type SqlDialect,
    type SqlExpected,
    type SqlExpectedTest,
} from "@zoeskoul/practice-checks";

export type TerminalExpectedTest = ProgrammingCodeTest;
export type CodeInputExpectedPayload = ProgrammingExpected | SqlExpected;
export type TerminalCodeInputExpectedPayload = ProgrammingExpected;
export type SqlCodeInputExpectedPayload = SqlExpected;

export type TemplateIoVarValue = string | number;

type TemplateIoRecipe = Extract<ManifestRecipe, { type: "template_io" }>;
type FixedTestsRecipe = Extract<ManifestRecipe, { type: "fixed_tests" }>;
type SqlQueryRecipe = Extract<ManifestRecipe, { type: "sql_query" }>;
type SemanticRecipe = Extract<ManifestRecipe, { type: "semantic" }>;

type TemplateIoRng = {
    int(min: number, max: number): number;
    pick<T>(from: readonly T[]): T;
};

function defaultTemplateIoRng(): TemplateIoRng {
    return {
        int(min) {
            return min;
        },
        pick<T>(from: readonly T[]) {
            if (!from.length) {
                throw new Error("Template recipe pick source cannot be empty.");
            }
            return from[0] as T;
        },
    };
}

export function fillTemplate(
    template: string,
    vars: Record<string, TemplateIoVarValue>,
): string {
    return template.replace(
        /\{([a-zA-Z0-9_]+)\}/g,
        (_, key) => String(vars[key] ?? ""),
    );
}

function resolveTemplateIoVar(
    rng: TemplateIoRng,
    spec: ManifestVarSpec,
    current: Record<string, TemplateIoVarValue>,
): TemplateIoVarValue {
    switch (spec.source) {
        case "int":
            return rng.int(spec.min, spec.max);
        case "pick":
            return rng.pick(spec.from);
        case "pickDifferentFromVar": {
            const avoid = String(current[spec.var] ?? "");
            let value = rng.pick(spec.from);
            for (let i = 0; i < 8 && String(value) === avoid; i += 1) {
                value = rng.pick(spec.from);
            }
            return value;
        }
        case "intDifferentFromVar": {
            const avoid = Number(current[spec.var] ?? 0);
            let value = rng.int(spec.min, spec.max);
            for (let i = 0; i < 8 && value === avoid; i += 1) {
                value = rng.int(spec.min, spec.max);
            }
            return value;
        }
        default:
            throw new Error("Unsupported template_io variable source.");
    }
}

function computeTemplateIoValue(
    spec: ManifestComputedSpec,
    vars: Record<string, TemplateIoVarValue>,
): TemplateIoVarValue {
    const left = Number(vars[spec.left] ?? 0);

    switch (spec.op) {
        case "add":
            return left + spec.right;
        case "sub":
            return left - spec.right;
        case "mul":
            return left * spec.right;
        case "floor_div":
            return Math.floor(left / spec.right);
        case "c_to_f_int":
            return Math.floor((left * 9) / 5 + 32);
        case "mul_div_floor":
            return Math.floor(
                (Number(vars[spec.left] ?? 0) * Number(vars[spec.right] ?? 0)) /
                    spec.divisor,
            );
        default:
            throw new Error("Unsupported template_io computed operation.");
    }
}

export function resolveTemplateIoVars(args: {
    recipe: TemplateIoRecipe;
    rng?: TemplateIoRng;
    vars?: Record<string, TemplateIoVarValue>;
}): Record<string, TemplateIoVarValue> {
    if (args.vars) {
        return { ...args.vars };
    }

    const rng = args.rng ?? defaultTemplateIoRng();
    const vars: Record<string, TemplateIoVarValue> = {};

    for (const [name, spec] of Object.entries(args.recipe.vars ?? {})) {
        vars[name] = resolveTemplateIoVar(rng, spec, vars);
    }

    for (const [name, spec] of Object.entries(args.recipe.computed ?? {})) {
        vars[name] = computeTemplateIoValue(spec, vars);
    }

    return vars;
}

export function buildFixedTestsExpected(
    recipe: FixedTestsRecipe,
): TerminalCodeInputExpectedPayload {
    if (!Array.isArray(recipe.tests) || recipe.tests.length < 1) {
        throw new Error("Programming fixed_tests code_input recipes require at least one test.");
    }

    return makeProgrammingExpected({
        tests: recipe.tests.map((test) => ({
            stdin: test.stdin,
            stdout: test.stdout,
            match: test.match ?? "exact",
        })),
        solutionCode: recipe.solutionCode,
    });
}

export function buildTemplateIoExpected(args: {
    recipe: TemplateIoRecipe;
    rng?: TemplateIoRng;
    vars?: Record<string, TemplateIoVarValue>;
}): TerminalCodeInputExpectedPayload {
    if (!Array.isArray(args.recipe.tests) || args.recipe.tests.length < 1) {
        throw new Error("Programming template_io code_input recipes require at least one test.");
    }

    const vars = resolveTemplateIoVars(args);

    return makeProgrammingExpected({
        tests: args.recipe.tests.map((test) => ({
            stdin: test.stdinTemplate
                ? fillTemplate(test.stdinTemplate, vars)
                : undefined,
            stdout: fillTemplate(test.stdoutTemplate, vars),
            match: test.match ?? "exact",
        })),
        ...(args.recipe.solutionTemplate
            ? { solutionCode: fillTemplate(args.recipe.solutionTemplate, vars) }
            : {}),
    });
}

export function buildSemanticExpected(
    recipe: SemanticRecipe,
): TerminalCodeInputExpectedPayload {
    const semanticChecks = Array.isArray(recipe.semanticChecks)
        ? recipe.semanticChecks
        : [];

    if (!semanticChecks.length) {
        throw new Error("Semantic code_input recipes require at least one semantic check.");
    }

    return makeProgrammingExpected({
        language: recipe.language as Parameters<typeof makeProgrammingExpected>[0]["language"],
        checkMode: "semantic",
        semanticChecks: semanticChecks as SemanticCheck[],
        solutionCode: recipe.solutionCode,
    });
}

function stripSqlComments(sql: string): string {
    return String(sql ?? "")
        .replace(/--.*$/gm, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function normalizeSql(value: unknown): string {
    return String(value ?? "").trim();
}

function normalizeIdentifier(identifier: string): string {
    return identifier
        .trim()
        .replace(/^["'`\[]+/, "")
        .replace(/["'`\]]+$/, "");
}

function quoteSqliteIdentifier(identifier: string): string {
    const clean = normalizeIdentifier(identifier);

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(clean)) {
        throw new Error(`Unsafe SQL identifier for generated checkSql: ${identifier}`);
    }

    return `"${clean.replace(/"/g, '""')}"`;
}

export function isMutationSql(sql: string): boolean {
    const cleaned = stripSqlComments(sql).trim().toLowerCase();
    return /^(insert|update|delete|replace|create|drop|alter)\b/.test(cleaned);
}

function extractMutationTableName(sql: string): string | null {
    const cleaned = stripSqlComments(sql).trim();

    const insertMatch = cleaned.match(
        /^\s*insert\s+(?:or\s+\w+\s+)?into\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (insertMatch?.[1]) return normalizeIdentifier(insertMatch[1]);

    const replaceMatch = cleaned.match(
        /^\s*replace\s+(?:or\s+\w+\s+)?into\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (replaceMatch?.[1]) return normalizeIdentifier(replaceMatch[1]);

    const updateMatch = cleaned.match(
        /^\s*update\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (updateMatch?.[1]) return normalizeIdentifier(updateMatch[1]);

    const deleteMatch = cleaned.match(
        /^\s*delete\s+from\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (deleteMatch?.[1]) return normalizeIdentifier(deleteMatch[1]);

    return null;
}

export function inferMutationCheckSql(solutionCode: string): string | undefined {
    if (!isMutationSql(solutionCode)) return undefined;

    const tableName = extractMutationTableName(solutionCode);
    if (!tableName) return undefined;

    return `SELECT * FROM ${quoteSqliteIdentifier(tableName)} ORDER BY 1;`;
}

export function buildSqlQueryExpected(args: {
    recipe: SqlQueryRecipe;
    fixedSqlDialect?: SqlDialect;
}): SqlCodeInputExpectedPayload {
    const fixedSqlDialect = args.fixedSqlDialect ?? "sqlite";
    const resultShape = args.recipe.resultShape ?? "table";
    const solutionCode = normalizeSql(args.recipe.solutionCode);

    if (!args.recipe.datasetId?.trim()) {
        throw new Error("SQL code_input expected payload requires datasetId.");
    }

    if (!solutionCode) {
        throw new Error("SQL code_input expected payload requires solutionCode.");
    }

    const checkSql =
        normalizeSql(args.recipe.checkSql) || inferMutationCheckSql(solutionCode);

    if (isMutationSql(solutionCode) && !checkSql) {
        throw new Error(
            "Mutation SQL exercises require checkSql so the grader can verify final database state.",
        );
    }

    const authoredTests =
        Array.isArray(args.recipe.tests) && args.recipe.tests.length > 0
            ? args.recipe.tests
            : null;

    return makeSqlExpected({
        language: "sql",
        fixedSqlDialect,
        runtime: {
            kind: "sql",
            datasetId: args.recipe.datasetId,
            resultShape,
        },
        tests: authoredTests
            ? authoredTests.map((test) => ({
                kind: "sql" as const,
                sqlDialect: test.sqlDialect ?? fixedSqlDialect,
                runtime: {
                    kind: "sql" as const,
                    datasetId: args.recipe.datasetId,
                    resultShape,
                },
                compareTo: test.compareTo ?? "solution",
                expectedTable: test.expectedTable,
                match: "table_exact" as const,
                ignoreRowOrder:
                    test.ignoreRowOrder ?? args.recipe.ignoreRowOrder ?? false,
                ...(normalizeSql(test.checkSql) || checkSql
                    ? { checkSql: normalizeSql(test.checkSql) || checkSql }
                    : {}),
            }))
            : [{
                kind: "sql",
                sqlDialect: fixedSqlDialect,
                runtime: {
                    kind: "sql",
                    datasetId: args.recipe.datasetId,
                    resultShape,
                },
                compareTo: "solution",
                match: "table_exact",
                ignoreRowOrder: args.recipe.ignoreRowOrder ?? false,
                ...(checkSql ? { checkSql } : {}),
            } satisfies SqlExpectedTest],
        solutionCode,
    });
}

export function buildCodeInputExpected(
    exercise: Pick<ManifestCodeInput, "recipe" | "fixedSqlDialect">,
): CodeInputExpectedPayload {
    switch (exercise.recipe.type) {
        case "fixed_tests":
            return buildFixedTestsExpected(exercise.recipe);
        case "template_io":
            return buildTemplateIoExpected({ recipe: exercise.recipe });
        case "semantic":
            return buildSemanticExpected(exercise.recipe);
        case "sql_query":
            return buildSqlQueryExpected({
                recipe: exercise.recipe,
                fixedSqlDialect: exercise.fixedSqlDialect,
            });
        default:
            throw new Error(
                `Unsupported code_input recipe type "${String((exercise.recipe as { type?: unknown }).type ?? "")}".`,
            );
    }
}
