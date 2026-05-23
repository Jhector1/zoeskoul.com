import type { SqlDialect } from "@zoeskoul/curriculum-contracts";

type RuntimeLike = {
    kind?: "sql" | "code" | string;
    language?: string;
    lang?: string;
    datasetId?: string;
    runtimeDefaultDatasetId?: string;
    fixedSqlDialect?: SqlDialect;
    sqlDialect?: SqlDialect;
    resultShape?: "table" | string;
    showTables?: boolean;
    showSchema?: boolean;
    showErd?: boolean;
    showChen?: boolean;
    supportsTerminal?: boolean;
    supportsMultiFile?: boolean;
    supportsFileSystem?: boolean;
};

type RuntimeSource =
    | "exercise.runtime"
    | "exercise.sqlDatasetId"
    | "recipe.datasetId"
    | "topic.runtimeDefaults"
    | "section.runtimeDefaults"
    | "module.runtimeDefaults"
    | "course.runtimeDefaults"
    | "subject.runtimeDefaults";

export type ResolveEffectiveExerciseRuntimeArgs = {
    subjectRuntimeDefaults?: unknown;
    courseRuntimeDefaults?: unknown;
    moduleRuntimeDefaults?: unknown;
    sectionRuntimeDefaults?: unknown;
    topicRuntimeDefaults?: unknown;
    exerciseRuntime?: unknown;
    exerciseSqlDatasetId?: string | null;
    recipe?: unknown;
    language?: string | null;
};

export type EffectiveExerciseRuntime = {
    kind?: "sql" | "code";
    datasetId?: string;
    fixedSqlDialect?: SqlDialect;
    resultShape?: "table";
    showTables: boolean;
    showSchema: boolean;
    showErd: boolean;
    showChen: boolean;
    supportsTerminal: boolean;
    supportsMultiFile: boolean;
    supportsFileSystem: boolean;
    sourceMap?: {
        datasetId?: RuntimeSource;
    };
};

type DatasetCandidate = {
    source: RuntimeSource;
    value?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function asRuntimeLike(value: unknown): RuntimeLike | null {
    return asRecord(value) as RuntimeLike | null;
}

function cleanString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

function inferRuntimeKind(args: {
    language?: string | null;
    recipe?: unknown;
    exerciseRuntime?: RuntimeLike | null;
    topicRuntimeDefaults?: RuntimeLike | null;
    sectionRuntimeDefaults?: RuntimeLike | null;
    moduleRuntimeDefaults?: RuntimeLike | null;
    courseRuntimeDefaults?: RuntimeLike | null;
    subjectRuntimeDefaults?: RuntimeLike | null;
}): "sql" | "code" | undefined {
    const layers = [
        args.exerciseRuntime,
        args.topicRuntimeDefaults,
        args.sectionRuntimeDefaults,
        args.moduleRuntimeDefaults,
        args.courseRuntimeDefaults,
        args.subjectRuntimeDefaults,
    ];

    for (const layer of layers) {
        const kind = cleanString(layer?.kind)?.toLowerCase();
        if (kind === "sql" || kind === "code") {
            return kind;
        }
    }

    const recipeType = cleanString(asRecord(args.recipe)?.type)?.toLowerCase();
    if (recipeType === "sql_query") return "sql";

    const language = cleanString(args.language)?.toLowerCase();
    if (language === "sql") return "sql";
    if (language) return "code";
    return undefined;
}

function pickDatasetCandidate(
    candidates: DatasetCandidate[],
): { datasetId?: string; source?: RuntimeSource } {
    for (const candidate of candidates) {
        const value = cleanString(candidate.value);
        if (value) {
            return { datasetId: value, source: candidate.source };
        }
    }

    return {};
}

function pickBoolean(
    key:
        | "showTables"
        | "showSchema"
        | "showErd"
        | "showChen"
        | "supportsTerminal"
        | "supportsMultiFile"
        | "supportsFileSystem",
    ...layers: Array<RuntimeLike | null>
): boolean | undefined {
    for (const layer of layers) {
        const value = cleanBoolean(layer?.[key]);
        if (value !== undefined) {
            return value;
        }
    }

    return undefined;
}

function pickDialect(...values: unknown[]): SqlDialect | undefined {
    for (const value of values) {
        const dialect = cleanString(value)?.toLowerCase();
        if (
            dialect === "sqlite" ||
            dialect === "postgres" ||
            dialect === "mysql" ||
            dialect === "mssql"
        ) {
            return dialect;
        }
    }

    return undefined;
}

function pickResultShape(...values: unknown[]): "table" | undefined {
    for (const value of values) {
        if (cleanString(value)?.toLowerCase() === "table") return "table";
    }

    return undefined;
}

export function resolveEffectiveExerciseRuntime(
    args: ResolveEffectiveExerciseRuntimeArgs,
): EffectiveExerciseRuntime {
    const exerciseRuntime = asRuntimeLike(args.exerciseRuntime);
    const topicRuntimeDefaults = asRuntimeLike(args.topicRuntimeDefaults);
    const sectionRuntimeDefaults = asRuntimeLike(args.sectionRuntimeDefaults);
    const moduleRuntimeDefaults = asRuntimeLike(args.moduleRuntimeDefaults);
    const courseRuntimeDefaults = asRuntimeLike(args.courseRuntimeDefaults);
    const subjectRuntimeDefaults = asRuntimeLike(args.subjectRuntimeDefaults);
    const recipe = asRecord(args.recipe);

    const kind = inferRuntimeKind({
        language: args.language,
        recipe,
        exerciseRuntime,
        topicRuntimeDefaults,
        sectionRuntimeDefaults,
        moduleRuntimeDefaults,
        courseRuntimeDefaults,
        subjectRuntimeDefaults,
    });

    const datasetResolution = pickDatasetCandidate([
        {
            source: "exercise.runtime",
            value:
                cleanString(exerciseRuntime?.datasetId) ??
                cleanString(exerciseRuntime?.runtimeDefaultDatasetId),
        },
        {
            source: "exercise.sqlDatasetId",
            value: cleanString(args.exerciseSqlDatasetId),
        },
        {
            source: "recipe.datasetId",
            value: cleanString(recipe?.datasetId),
        },
        {
            source: "topic.runtimeDefaults",
            value:
                cleanString(topicRuntimeDefaults?.datasetId) ??
                cleanString(topicRuntimeDefaults?.runtimeDefaultDatasetId),
        },
        {
            source: "section.runtimeDefaults",
            value:
                cleanString(sectionRuntimeDefaults?.datasetId) ??
                cleanString(sectionRuntimeDefaults?.runtimeDefaultDatasetId),
        },
        {
            source: "module.runtimeDefaults",
            value:
                cleanString(moduleRuntimeDefaults?.datasetId) ??
                cleanString(moduleRuntimeDefaults?.runtimeDefaultDatasetId),
        },
        {
            source: "course.runtimeDefaults",
            value:
                cleanString(courseRuntimeDefaults?.datasetId) ??
                cleanString(courseRuntimeDefaults?.runtimeDefaultDatasetId),
        },
        {
            source: "subject.runtimeDefaults",
            value:
                cleanString(subjectRuntimeDefaults?.datasetId) ??
                cleanString(subjectRuntimeDefaults?.runtimeDefaultDatasetId),
        },
    ]);

    const fixedSqlDialect = pickDialect(
        exerciseRuntime?.fixedSqlDialect,
        exerciseRuntime?.sqlDialect,
        recipe?.sqlDialect,
        topicRuntimeDefaults?.fixedSqlDialect,
        topicRuntimeDefaults?.sqlDialect,
        sectionRuntimeDefaults?.fixedSqlDialect,
        sectionRuntimeDefaults?.sqlDialect,
        moduleRuntimeDefaults?.fixedSqlDialect,
        moduleRuntimeDefaults?.sqlDialect,
        courseRuntimeDefaults?.fixedSqlDialect,
        courseRuntimeDefaults?.sqlDialect,
        subjectRuntimeDefaults?.fixedSqlDialect,
        subjectRuntimeDefaults?.sqlDialect,
    );

    const resultShape = pickResultShape(
        exerciseRuntime?.resultShape,
        recipe?.resultShape,
        topicRuntimeDefaults?.resultShape,
        sectionRuntimeDefaults?.resultShape,
        moduleRuntimeDefaults?.resultShape,
        courseRuntimeDefaults?.resultShape,
        subjectRuntimeDefaults?.resultShape,
    );

    const showTables =
        pickBoolean(
            "showTables",
            exerciseRuntime,
            topicRuntimeDefaults,
            sectionRuntimeDefaults,
            moduleRuntimeDefaults,
            courseRuntimeDefaults,
            subjectRuntimeDefaults,
        ) ??
        (kind === "sql" && Boolean(datasetResolution.datasetId));

    return {
        kind,
        datasetId: datasetResolution.datasetId,
        fixedSqlDialect,
        resultShape,
        showTables: Boolean(showTables),
        showSchema:
            pickBoolean(
                "showSchema",
                exerciseRuntime,
                topicRuntimeDefaults,
                sectionRuntimeDefaults,
                moduleRuntimeDefaults,
                courseRuntimeDefaults,
                subjectRuntimeDefaults,
            ) ??
            (kind === "sql" && Boolean(datasetResolution.datasetId)),
        showErd:
            pickBoolean(
                "showErd",
                exerciseRuntime,
                topicRuntimeDefaults,
                sectionRuntimeDefaults,
                moduleRuntimeDefaults,
                courseRuntimeDefaults,
                subjectRuntimeDefaults,
            ) ?? false,
        showChen:
            pickBoolean(
                "showChen",
                exerciseRuntime,
                topicRuntimeDefaults,
                sectionRuntimeDefaults,
                moduleRuntimeDefaults,
                courseRuntimeDefaults,
                subjectRuntimeDefaults,
            ) ?? false,
        supportsTerminal:
            pickBoolean(
                "supportsTerminal",
                exerciseRuntime,
                topicRuntimeDefaults,
                sectionRuntimeDefaults,
                moduleRuntimeDefaults,
                courseRuntimeDefaults,
                subjectRuntimeDefaults,
            ) ?? false,
        supportsMultiFile:
            pickBoolean(
                "supportsMultiFile",
                exerciseRuntime,
                topicRuntimeDefaults,
                sectionRuntimeDefaults,
                moduleRuntimeDefaults,
                courseRuntimeDefaults,
                subjectRuntimeDefaults,
            ) ?? false,
        supportsFileSystem:
            pickBoolean(
                "supportsFileSystem",
                exerciseRuntime,
                topicRuntimeDefaults,
                sectionRuntimeDefaults,
                moduleRuntimeDefaults,
                courseRuntimeDefaults,
                subjectRuntimeDefaults,
            ) ?? false,
        sourceMap: datasetResolution.source
            ? {
                datasetId: datasetResolution.source,
            }
            : undefined,
    };
}
