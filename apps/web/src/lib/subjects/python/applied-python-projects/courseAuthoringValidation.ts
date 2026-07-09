export type JsonRecord = Record<string, unknown>;

export type AuthoredFile = {
    path: string;
    content: string;
};

const OUTPUT_SEMANTIC_CHECK_TYPES = new Set([
    "printed_line_count",
    "stdout_contains",
    "stdout_equals",
    "no_stdout",
]);

const STRUCTURAL_SEMANTIC_CHECK_TYPES = new Set([
    "constructible",
    "defines_class",
    "defines_function",
    "imports_symbol",
]);

const GENERIC_STARTER_COMMENT =
    "complete the class or method described in the exercise";

export function isJsonRecord(value: unknown): value is JsonRecord {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function starterFileHasSpecificGuidance(content: string): boolean {
    const comments = Array.from(content.matchAll(/^\s*#\s*(.+)$/gm)).map(
        (match) => match[1]?.trim().toLowerCase() ?? "",
    );

    return comments.some(
        (comment) =>
            comment.length > 0 &&
            !comment.includes(GENERIC_STARTER_COMMENT),
    );
}

export function topLevelPythonClassNames(source: string): string[] {
    return Array.from(
        source.matchAll(/^class\s+([A-Za-z_]\w*)\b/gm),
        (match) => match[1] ?? "",
    ).filter(Boolean);
}

function numericArguments(check: JsonRecord): number[] {
    const values: unknown[] = [];

    for (const field of ["constructorArgs", "methodArgs"] as const) {
        if (Array.isArray(check[field])) {
            values.push(...check[field]);
        }
    }

    if (Array.isArray(check.calls)) {
        for (const call of check.calls) {
            if (!isJsonRecord(call) || !Array.isArray(call.methodArgs)) continue;
            values.push(...call.methodArgs);
        }
    }

    return values.filter((value): value is number => typeof value === "number");
}

export function semanticCheckPriority(check: JsonRecord): number {
    const type = typeof check.type === "string" ? check.type : "";

    if (OUTPUT_SEMANTIC_CHECK_TYPES.has(type)) return 100;
    if (STRUCTURAL_SEMANTIC_CHECK_TYPES.has(type)) return 0;
    if (numericArguments(check).some((value) => value <= 0)) return 10;
    return 20;
}

export function semanticChecksPutBehaviorBeforeOutput(
    checks: unknown,
): boolean {
    if (!Array.isArray(checks)) return true;

    const records = checks.filter(isJsonRecord);
    const priorities = records.map(semanticCheckPriority);

    return priorities.every(
        (priority, index) => index === 0 || priority >= priorities[index - 1]!,
    );
}

function isModelPythonFile(file: AuthoredFile): boolean {
    const normalized = file.path.replaceAll("\\", "/");
    return (
        normalized.startsWith("models/") &&
        normalized.endsWith(".py") &&
        !normalized.endsWith("/__init__.py")
    );
}

export function findDuplicateModelClassIssues(
    files: AuthoredFile[],
): string[] {
    const owners = new Map<string, string>();
    const issues: string[] = [];

    for (const file of files.filter(isModelPythonFile)) {
        const basename = file.path.replaceAll("\\", "/").split("/").at(-1) ?? "";
        const classes = topLevelPythonClassNames(file.content);

        if (basename.startsWith("base_")) {
            for (const className of classes) {
                if (!className.startsWith("Base")) {
                    issues.push(
                        `${file.path} defines ${className}; a base_* model must define a Base* class.`,
                    );
                }
            }
        }

        for (const className of classes) {
            const previous = owners.get(className);
            if (previous && previous !== file.path) {
                issues.push(
                    `${previous} and ${file.path} both define ${className}.`,
                );
            } else {
                owners.set(className, file.path);
            }
        }
    }

    return issues;
}
