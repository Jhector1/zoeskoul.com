import {
    normalizeWorkspacePath,
    type ManifestStarterFile,
    type ProgrammingCodeInputStarterFileDraft,
    type TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";

type SqlCodeExercise = Extract<
    TopicAuthoringDraft["quizDraft"][number],
    { kind: "code_input" }
>;

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function safeSqlPath(value: unknown, label: string): string {
    const path = normalizeText(value);
    if (!path) {
        throw new Error(`${label} must be a non-empty workspace-relative path.`);
    }

    try {
        return normalizeWorkspacePath(path);
    } catch (error) {
        throw new Error(`${label}: ${(error as Error).message}`);
    }
}

export function normalizeSqlWorkspaceFiles(
    files: ProgrammingCodeInputStarterFileDraft[] | undefined,
    label: string,
): ManifestStarterFile[] {
    if (!Array.isArray(files)) return [];

    const seen = new Set<string>();
    return files.map((file, index) => {
        const path = safeSqlPath(file?.path, `${label}[${index}].path`);
        if (seen.has(path)) {
            throw new Error(`${label} contains duplicate path "${path}".`);
        }
        seen.add(path);

        if (!path.toLowerCase().endsWith(".sql")) {
            throw new Error(`${label}[${index}].path must end with .sql.`);
        }

        return {
            path,
            content: String(file?.content ?? ""),
            language: "sql" as const,
            ...(typeof file?.isEntry === "boolean"
                ? { isEntry: file.isEntry }
                : {}),
            ...(typeof file?.entry === "boolean"
                ? { entry: file.entry }
                : {}),
            ...(typeof file?.readOnly === "boolean"
                ? { readOnly: file.readOnly }
                : {}),
        };
    });
}

export function resolveSqlEntryFilePath(args: {
    exercise: SqlCodeExercise;
    files: ManifestStarterFile[];
}): string {
    const explicit = normalizeText(args.exercise.entryFilePath);
    if (explicit) {
        return safeSqlPath(explicit, `SQL exercise "${args.exercise.id}" entryFilePath`);
    }

    const marked = args.files.find(
        (file) => file.isEntry === true || file.entry === true,
    );
    const markedPath = normalizeText(marked?.path ?? marked?.name);
    if (markedPath) return safeSqlPath(markedPath, "SQL entry file path");

    return args.files.length > 1 ? "query.sql" : "main.sql";
}

export function resolveSqlFileOrder(args: {
    exerciseId: string;
    authoredOrder?: string[];
    files: ManifestStarterFile[];
    entryFilePath: string;
}): string[] {
    const paths = args.files.map((file) =>
        safeSqlPath(file.path ?? file.name, `SQL exercise "${args.exerciseId}" file path`),
    );

    if (paths.length <= 1) {
        return paths.length === 1 ? paths : [args.entryFilePath];
    }

    if (!Array.isArray(args.authoredOrder) || args.authoredOrder.length === 0) {
        throw new Error(
            `Multi-file SQL exercise "${args.exerciseId}" must include sqlFileOrder.`,
        );
    }

    const order = args.authoredOrder.map((path, index) =>
        safeSqlPath(path, `SQL exercise "${args.exerciseId}" sqlFileOrder[${index}]`),
    );

    if (new Set(order).size !== order.length) {
        throw new Error(
            `Multi-file SQL exercise "${args.exerciseId}" sqlFileOrder contains duplicate paths.`,
        );
    }

    const pathSet = new Set(paths);
    const orderSet = new Set(order);
    const missing = paths.filter((path) => !orderSet.has(path));
    const unknown = order.filter((path) => !pathSet.has(path));

    if (missing.length > 0 || unknown.length > 0) {
        throw new Error(
            [
                `Multi-file SQL exercise "${args.exerciseId}" sqlFileOrder must list every solution file exactly once.`,
                missing.length ? `Missing: ${missing.join(", ")}.` : "",
                unknown.length ? `Unknown: ${unknown.join(", ")}.` : "",
            ]
                .filter(Boolean)
                .join(" "),
        );
    }

    if (!orderSet.has(args.entryFilePath)) {
        throw new Error(
            `Multi-file SQL exercise "${args.exerciseId}" sqlFileOrder must include entryFilePath "${args.entryFilePath}".`,
        );
    }

    return order;
}

export function buildSqlWorkspaceProgram(args: {
    files: ManifestStarterFile[];
    fileOrder: string[];
}): string {
    const byPath = new Map(
        args.files.map((file) => [
            normalizeText(file.path ?? file.name),
            String(file.content ?? "").trim(),
        ]),
    );

    return args.fileOrder
        .map((path) => {
            const content = byPath.get(path);
            if (typeof content !== "string") {
                throw new Error(`SQL workspace execution order references missing file "${path}".`);
            }
            return [`-- file: ${path}`, content].filter(Boolean).join("\n");
        })
        .join("\n\n")
        .trim();
}

export function buildSqlDraftProgram(
    exercise: SqlCodeExercise,
    source: "starter" | "solution",
): string {
    const rawFiles = source === "starter" ? exercise.starterFiles : exercise.solutionFiles;
    const files = normalizeSqlWorkspaceFiles(
        rawFiles,
        `SQL exercise "${exercise.id}" ${source}Files`,
    );

    if (files.length <= 1 && !Array.isArray(exercise.sqlFileOrder)) {
        return normalizeText(
            source === "starter" ? exercise.starterCode : exercise.solutionCode,
        );
    }

    const entryFilePath = resolveSqlEntryFilePath({ exercise, files });
    const order = resolveSqlFileOrder({
        exerciseId: exercise.id,
        authoredOrder: exercise.sqlFileOrder,
        files,
        entryFilePath,
    });

    return buildSqlWorkspaceProgram({ files, fileOrder: order });
}

export function collectSqlDraftSources(exercise: SqlCodeExercise): string[] {
    const starterProgram = buildSqlDraftProgram(exercise, "starter");
    const solutionProgram = buildSqlDraftProgram(exercise, "solution");
    const solutionAndCheck = [solutionProgram, normalizeText(exercise.checkSql)]
        .filter(Boolean)
        .join("\n\n");

    return [starterProgram, solutionAndCheck]
        .map(normalizeText)
        .filter(Boolean);
}
