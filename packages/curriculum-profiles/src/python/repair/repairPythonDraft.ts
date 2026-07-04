import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { getCodeRunner, runLocalCode } from "@zoeskoul/curriculum-runtime";
import type { RepairReport } from "../../shared/profileServices.js";
import { makeEmptyRepairReport } from "../../shared/noopReports.js";
import { PYTHON_MINIMUM_FIXED_TESTS } from "../profile.js";
import type { SemanticCheck } from "@zoeskoul/practice-checks";
function hasTryItYourselfSketch(draft: TopicAuthoringDraft): boolean {
    return draft.sketchBlocks.some((block) =>
        /\btry it yourself\b|\btry this\b|\byour turn\b|\btry on your own\b/i.test(
            String(block.bodyMarkdown ?? ""),
        ),
    );
}
function hasTopLevelPrintCall(source: string): boolean {
    return String(source ?? "")
        .split("\n")
        .some((line) => {
            if (/^\s/.test(line)) return false;
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) return false;
            return /\bprint\s*\(/.test(trimmed);
        });
}

function looksLikeRunnableProjectProgram(exercise: PythonCodeInputExercise): boolean {
    const prompt = String(exercise.prompt ?? "").toLowerCase();
    const solutionCode = String(exercise.solutionCode ?? "");

    return (
        hasTopLevelPrintCall(solutionCode) &&
        (
            /\bopen\s*\(/.test(solutionCode) ||
            /\bfile\b/.test(prompt) ||
            /\breport\b/.test(prompt) ||
            /\bvisible output\b/.test(prompt) ||
            /\bprint\b/.test(prompt) ||
            /\brunnable part\b/.test(prompt) ||
            /\bat the bottom\b/.test(prompt)
        )
    );
}

function looksLikeOopSemanticStructureExercise(exercise: PythonCodeInputExercise): boolean {
    const semanticChecks = Array.isArray(exercise.semanticChecks)
        ? exercise.semanticChecks
        : [];

    if (
        semanticChecks.some((check) => {
            const type = String((check as { type?: unknown }).type ?? "");
            return (
                type === "defines_class" ||
                type === "constructible" ||
                type === "instance_attributes" ||
                type === "method_returns" ||
                type === "created_instances"
            );
        })
    ) {
        return true;
    }

    const text = [
        exercise.id,
        exercise.title,
        exercise.prompt,
        exercise.starterCode,
        exercise.solutionCode,
    ]
        .map((value) => String(value ?? ""))
        .join("\n")
        .toLowerCase();

    const hasWorkspacePythonFiles = [exercise.starterFiles, exercise.solutionFiles]
        .some((files) => Array.isArray(files) && files.some((file) => {
            const path = String((file as { path?: unknown }).path ?? "");
            return path.endsWith(".py") && path !== "main.py";
        }));

    return (
        /\bclass\s+[a-z_][a-z0-9_]*\b/i.test(String(exercise.solutionCode ?? "")) ||
        /\bdef\s+__init__\b/.test(String(exercise.solutionCode ?? "")) ||
        /\bself\./.test(String(exercise.solutionCode ?? "")) ||
        /\b(class|object|instance|attribute|constructor|method|subclass|inherits?|override|polymorphism|abstraction)\b/.test(text) ||
        (hasWorkspacePythonFiles && /\b(import|models?\/|services?\/|helpers?\/)\b/.test(text))
    );
}


function collectPythonExerciseSource(exercise: PythonCodeInputExercise): string {
    const parts = [
        exercise.id,
        exercise.title,
        exercise.prompt,
        exercise.starterCode,
        exercise.solutionCode,
    ].map((value) => String(value ?? ""));

    const appendFiles = (files: unknown) => {
        if (!Array.isArray(files)) return;
        for (const file of files) {
            if (!file || typeof file !== "object") continue;
            const path = String((file as { path?: unknown }).path ?? "");
            const content = String((file as { content?: unknown }).content ?? "");
            if (path || content) parts.push(`${path}\n${content}`);
        }
    };

    appendFiles(exercise.files);
    appendFiles(exercise.starterFiles);
    appendFiles(exercise.solutionFiles);

    for (const test of Array.isArray(exercise.tests) ? exercise.tests : []) {
        appendFiles((test as { files?: unknown }).files);
    }

    return parts.join("\n");
}

function parseSimplePythonLiteralForSemantic(value: string): unknown {
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
    if (/^-?\d+\.\d+$/.test(text)) return Number.parseFloat(text);
    if (text === "True") return true;
    if (text === "False") return false;
    if (text === "None") return null;
    if (
        (text.startsWith("'") && text.endsWith("'")) ||
        (text.startsWith('"') && text.endsWith('"'))
    ) {
        return text.slice(1, -1);
    }
    return text;
}

function splitSimplePythonArgs(source: string): unknown[] {
    const args: string[] = [];
    let current = "";
    let quote: string | null = null;
    let depth = 0;

    for (const char of String(source ?? "")) {
        if (quote) {
            current += char;
            if (char === quote) quote = null;
            continue;
        }
        if (char === "'" || char === '"') {
            quote = char;
            current += char;
            continue;
        }
        if (char === "(" || char === "[" || char === "{") depth += 1;
        if (char === ")" || char === "]" || char === "}") depth = Math.max(0, depth - 1);
        if (char === "," && depth === 0) {
            args.push(current.trim());
            current = "";
            continue;
        }
        current += char;
    }

    if (current.trim()) args.push(current.trim());
    return args.map(parseSimplePythonLiteralForSemantic);
}

function extractFirstClassNameForSemantic(exercise: PythonCodeInputExercise): string | null {
    const source = collectPythonExerciseSource(exercise);
    const definition = extractPythonClassDefinitions(source)[0];
    if (definition?.name) return definition.name;

    const promptBacktickMatch = String(exercise.prompt ?? "").match(/`([A-Z][A-Za-z0-9_]*)`/);
    if (promptBacktickMatch?.[1]) return promptBacktickMatch[1];

    const constructorMatch = source.match(/\b([A-Z][A-Za-z0-9_]*)\s*\(/);
    return constructorMatch?.[1] ?? null;
}

function extractFirstConstructorArgsForClass(source: string, className: string): unknown[] {
    const argsPattern = new RegExp(`\\b${escapeRegExp(className)}\\s*\\(([^)]*)\\)`);

    for (const line of String(source ?? "").split("\n")) {
        if (new RegExp(`^\\s*class\\s+${escapeRegExp(className)}\\b`).test(line)) {
            continue;
        }

        const match = line.match(argsPattern);
        if (!match) continue;

        const rawArgs = String(match[1] ?? "").trim();
        if (!rawArgs) return [];
        return splitSimplePythonArgs(rawArgs);
    }

    return [];
}

function countConstructorCallsForClass(source: string, className: string): number {
    const pattern = new RegExp(`\\b${escapeRegExp(className)}\\s*\\(`, "g");
    let count = 0;

    for (const line of String(source ?? "").split("\n")) {
        if (new RegExp(`^\\s*class\\s+${escapeRegExp(className)}\\b`).test(line)) {
            continue;
        }
        count += Array.from(line.matchAll(pattern)).length;
    }

    return count;
}

function firstNonEmptyStdoutLine(exercise: PythonCodeInputExercise): string | null {
    for (const test of Array.isArray(exercise.tests) ? exercise.tests : []) {
        const lines = String((test as { stdout?: unknown }).stdout ?? "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length > 0) return lines[0] ?? null;
    }
    return null;
}

function countExpectedStdoutLines(exercise: PythonCodeInputExercise): number {
    const firstTest = Array.isArray(exercise.tests) ? exercise.tests[0] : null;
    return String((firstTest as { stdout?: unknown } | null)?.stdout ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .length;
}

function extractClassBaseNames(definition: PythonClassDefinition): string[] {
    const match = definition.header.match(/^class\s+[A-Za-z_]\w*\s*\(([^)]*)\)/);
    if (!match) return [];

    return String(match[1] ?? "")
        .split(",")
        .map((part) => part.trim().split(".").pop() ?? "")
        .map((part) => part.replace(/\s*=.*$/, "").trim())
        .filter(Boolean);
}

function classDefinitionIsAbstract(definition: PythonClassDefinition): boolean {
    if (/\bABC\b/.test(definition.header)) return true;

    for (const methodLines of definition.methods.values()) {
        if (methodLines.some((line) => /@abstractmethod\b/.test(line))) {
            return true;
        }
    }

    return false;
}

function methodBodyPrints(definition: PythonClassDefinition, methodName: string): boolean {
    const methodLines = definition.methods.get(methodName) ?? [];
    return methodLines.some((line) => /\bprint\s*\(/.test(line));
}

function concreteSubclassesForMethod(args: {
    definitions: PythonClassDefinition[];
    baseClassName: string;
    methodName: string;
}): PythonClassDefinition[] {
    return args.definitions.filter((definition) => {
        if (definition.name === args.baseClassName) return false;
        if (!definition.methods.has(args.methodName)) return false;
        if (classDefinitionIsAbstract(definition)) return false;
        return extractClassBaseNames(definition).includes(args.baseClassName);
    });
}

function inferConcreteConstructibleClassChecks(args: {
    source: string;
    definitions: PythonClassDefinition[];
    baseClassName: string;
    methodName: string | null;
}): SemanticCheck[] {
    if (!args.methodName) return [];

    const subclasses = concreteSubclassesForMethod({
        definitions: args.definitions,
        baseClassName: args.baseClassName,
        methodName: args.methodName,
    });

    const checks: SemanticCheck[] = [];

    for (const definition of subclasses.slice(0, 3)) {
        const constructorArgs = extractFirstConstructorArgsForClass(args.source, definition.name);
        const constructorParamCount = extractInitParams(args.source, definition.name).length;

        checks.push({
            type: "defines_class",
            className: definition.name,
            message: `Define the ${definition.name} subclass for this workspace exercise.`,
        });

        if (constructorArgs.length > 0 || constructorParamCount === 0) {
            checks.push({
                type: "constructible",
                className: definition.name,
                constructorArgs,
                message: `${definition.name} should be constructible with the example arguments.`,
            });
        }

        if (methodBodyPrints(definition, args.methodName)) {
            checks.push({
                type: "method_returns",
                className: definition.name,
                constructorArgs,
                methodName: args.methodName,
                methodArgs: [],
                expected: null,
                message: `${definition.name}.${args.methodName}() should run without returning a value while producing its output.`,
            });
        }
    }

    return checks;
}

function inferFirstPublicZeroArgMethodName(definitions: PythonClassDefinition[]): string | null {
    for (const definition of definitions) {
        for (const [methodName, methodLines] of definition.methods) {
            if (methodName === "__init__" || methodName.startsWith("_")) continue;
            const signature = methodLines[0] ?? "";
            const args = signature.match(/def\s+[A-Za-z_]\w*\s*\(([^)]*)\)/)?.[1] ?? "";
            const params = args
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean)
                .map((part) => part.split("=")[0]?.trim() ?? "")
                .map((part) => part.split(":")[0]?.trim() ?? "")
                .filter((part) => part && part !== "self");

            if (params.length === 0) return methodName;
        }
    }

    return null;
}

function inferFirstZeroArgMethodCall(source: string): string | null {
    const methodMatch = String(source ?? "").match(/\.([A-Za-z_]\w*)\s*\(\s*\)/);
    const methodName = methodMatch?.[1] ?? "";
    if (!methodName || methodName.startsWith("_")) return null;
    if (methodName === "print") return null;
    return methodName;
}

function normalizePythonWorkspaceFilesForSemantic(args: {
    entryFilePath: string;
    mergedFiles: Array<{ path: string; content: string; readOnly?: boolean }>;
    markedStarterFiles: Map<string, string>;
    markedSolutionFiles: Map<string, string>;
}): Array<{
    path: string;
    content: string;
    language: "python";
    isEntry: boolean;
    entry: boolean;
    readOnly?: boolean;
}> {
    return args.mergedFiles.map((file) => ({
        path: file.path,
        content:
            args.markedSolutionFiles.get(file.path) ??
            args.markedStarterFiles.get(file.path) ??
            file.content,
        language: "python" as const,
        isEntry: file.path === args.entryFilePath,
        entry: file.path === args.entryFilePath,
        ...(typeof file.readOnly === "boolean" ? { readOnly: file.readOnly } : {}),
    }));
}

function convertOopFixedTestsToSemantic(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    if ((exercise.recipeType ?? "fixed_tests") === "semantic") return null;
    if (Array.isArray(exercise.semanticChecks) && exercise.semanticChecks.length > 0) return null;
    if (!looksLikeOopSemanticStructureExercise(exercise)) return null;

    const className = extractFirstClassNameForSemantic(exercise);
    if (!className) return null;

    const mergedFiles = mergePythonFixtureFiles(
        exercise.files,
        Array.isArray(exercise.tests) ? exercise.tests[0]?.files : undefined,
    ) ?? [];
    const multifileOrImportedWorkspace =
        mergedFiles.some((file) => file.path.endsWith(".py") && file.path !== "main.py") ||
        /\bfrom\s+(models|services|helpers)\.[A-Za-z0-9_.]+\s+import\b/.test(
            `${String(exercise.starterCode ?? "")}\n${String(exercise.solutionCode ?? "")}`,
        );
    if (!multifileOrImportedWorkspace) return null;
    const markedStarterFiles = extractMarkedPythonFiles(exercise.starterCode);
    const markedSolutionFiles = extractMarkedPythonFiles(exercise.solutionCode);
    const entryFilePath = String(
        (exercise as { entryFilePath?: unknown }).entryFilePath ??
        (mergedFiles.some((file) => file.path === "main.py") ? "main.py" : mergedFiles[0]?.path ?? "main.py"),
    );
    const solutionFiles = mergedFiles.length > 0
        ? normalizePythonWorkspaceFilesForSemantic({
            entryFilePath,
            mergedFiles,
            markedStarterFiles,
            markedSolutionFiles,
        })
        : undefined;
    const starterFiles = solutionFiles
        ? solutionFiles.map((file) => ({
            ...file,
            content: markedStarterFiles.get(file.path) ?? (file.path === entryFilePath ? String(exercise.starterCode ?? "") : file.content),
        }))
        : undefined;

    const semanticSource = [
        collectPythonExerciseSource(exercise),
        ...(solutionFiles ?? []).map((file) => file.content),
    ].join("\n");
    const definitions = extractPythonClassDefinitions(semanticSource);
    const baseDefinition = definitions.find((definition) => definition.name === className);
    const constructorArgs = extractFirstConstructorArgsForClass(semanticSource, className);
    const constructorParamCount = extractInitParams(semanticSource, className).length;
    const instanceCount = countConstructorCallsForClass(String(exercise.solutionCode ?? ""), className);
    const stdoutLineCount = countExpectedStdoutLines(exercise);
    const semanticChecks: SemanticCheck[] = [
        {
            type: "defines_class",
            className,
            message: `Define or import the ${className} class for this workspace exercise.`,
        },
    ];

    const baseIsAbstract = baseDefinition ? classDefinitionIsAbstract(baseDefinition) : false;

    if (!baseIsAbstract && (constructorArgs.length > 0 || constructorParamCount === 0)) {
        semanticChecks.push({
            type: "constructible",
            className,
            constructorArgs,
            message: `${className} should be constructible with the example arguments.`,
        });
    }

    const methodName = inferFirstZeroArgMethodCall(String(exercise.solutionCode ?? "")) ?? inferFirstPublicZeroArgMethodName(definitions);
    const firstStdoutLine = firstNonEmptyStdoutLine(exercise);
    const concreteChecks = inferConcreteConstructibleClassChecks({
        source: semanticSource,
        definitions,
        baseClassName: className,
        methodName,
    });
    semanticChecks.push(...concreteChecks);

    if (
        concreteChecks.length < 1 &&
        methodName &&
        firstStdoutLine !== null &&
        !baseIsAbstract &&
        (constructorArgs.length > 0 || constructorParamCount === 0)
    ) {
        semanticChecks.push({
            type: "method_returns",
            className,
            constructorArgs,
            methodName,
            methodArgs: [],
            expected: parseSimplePythonLiteralForSemantic(firstStdoutLine),
            message: `${className}.${methodName}() should return the expected value.`,
        });
    }

    if (!baseIsAbstract && instanceCount > 0) {
        semanticChecks.push({
            type: "created_instances",
            className,
            min: Math.min(instanceCount, 3),
            message: `Create the required ${className} instance(s).`,
        });
    }

    if (stdoutLineCount > 0) {
        semanticChecks.push({
            type: "printed_line_count",
            min: stdoutLineCount,
            message: `Print at least ${stdoutLineCount} non-empty output line(s).`,
        });
    }

    if (semanticChecks.length < 2) return null;

    const entryStarter = starterFiles?.find((file) => file.path === entryFilePath)?.content;
    const entrySolution = solutionFiles?.find((file) => file.path === entryFilePath)?.content;
    const { tests: _removedTests, files: _removedFiles, ...rest } = exercise;

    return {
        ...rest,
        recipeType: "semantic",
        semanticChecks,
        ...(starterFiles ? { starterFiles } : {}),
        ...(solutionFiles ? { solutionFiles } : {}),
        ...(entryStarter !== undefined ? { starterCode: entryStarter } : {}),
        ...(entrySolution !== undefined ? { solutionCode: entrySolution } : {}),
        entryFilePath,
    };
}

function extractMarkedPythonFiles(source: unknown): Map<string, string> {
    const result = new Map<string, string>();
    const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
    let currentPath: string | null = null;
    let currentLines: string[] = [];

    function flush() {
        if (!currentPath) return;
        result.set(currentPath, currentLines.join("\n").trimEnd());
    }

    for (const line of lines) {
        const match = /^\s*#\s*([a-zA-Z0-9_.\/-]+\.py)\s*$/.exec(line);
        if (match?.[1]) {
            flush();
            currentPath = match[1];
            currentLines = [];
            continue;
        }

        if (currentPath) {
            currentLines.push(line);
        }
    }

    flush();
    return result;
}

function promoteSemanticOopFilesToWorkspaceFiles(exercise: PythonCodeInputExercise): {
    exercise: PythonCodeInputExercise;
    changed: boolean;
} {
    if (!isSemanticCodeExercise(exercise)) return { exercise, changed: false };
    if (!looksLikeOopSemanticStructureExercise(exercise)) return { exercise, changed: false };

    const fixtureFiles = normalizeDraftFixtureFiles(exercise.files);
    const pythonFiles = fixtureFiles.filter((file) => file.path.endsWith(".py"));
    const nonPythonFiles = fixtureFiles.filter((file) => !file.path.endsWith(".py"));

    const existingStarterFiles = Array.isArray(exercise.starterFiles)
        ? exercise.starterFiles
        : [];
    const existingSolutionFiles = Array.isArray(exercise.solutionFiles)
        ? exercise.solutionFiles
        : [];

    if (pythonFiles.length < 1 && existingSolutionFiles.length > 0) {
        return { exercise, changed: false };
    }

    const starterByPath = extractMarkedPythonFiles(exercise.starterCode);
    const solutionByPath = extractMarkedPythonFiles(exercise.solutionCode);
    const entryFilePath = String(
        (exercise as { entryFilePath?: unknown }).entryFilePath ??
        (pythonFiles.some((file) => file.path === "main.py") ? "main.py" : pythonFiles[0]?.path ?? "main.py"),
    );

    const starterFiles = existingStarterFiles.length > 0
        ? existingStarterFiles
        : pythonFiles.map((file) => ({
            path: file.path,
            content:
                starterByPath.get(file.path) ??
                (file.path === entryFilePath ? String(exercise.starterCode ?? "") : ""),
            language: "python" as const,
            isEntry: file.path === entryFilePath,
            entry: file.path === entryFilePath,
        }));

    const solutionFiles = existingSolutionFiles.length > 0
        ? existingSolutionFiles
        : pythonFiles.map((file) => ({
            path: file.path,
            content: solutionByPath.get(file.path) ?? file.content,
            language: "python" as const,
            isEntry: file.path === entryFilePath,
            entry: file.path === entryFilePath,
        }));

    const changed =
        existingStarterFiles.length < 1 ||
        existingSolutionFiles.length < 1 ||
        pythonFiles.length !== fixtureFiles.length;

    if (!changed) return { exercise, changed: false };

    const nextExercise: PythonCodeInputExercise = {
        ...exercise,
        entryFilePath,
        starterFiles,
        solutionFiles,
    };

    if (nonPythonFiles.length > 0) {
        nextExercise.files = nonPythonFiles;
    } else {
        delete nextExercise.files;
    }

    return { exercise: nextExercise, changed: true };
}

function toSnakeCase(value: string): string {
    return String(value ?? "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
}

function extractPythonImportsBySymbol(source: string): Map<string, string> {
    const imports = new Map<string, string>();

    for (const line of String(source ?? "").split("\n")) {
        const match = line.match(/^\s*from\s+([A-Za-z0-9_.]+)\s+import\s+(.+)\s*$/);
        if (!match) continue;

        const moduleName = String(match[1] ?? "").trim();
        const imported = String(match[2] ?? "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);

        for (const symbol of imported) {
            const name = symbol.split(/\s+as\s+/i)[0]?.trim() ?? "";
            if (name) imports.set(name, `${moduleName.replace(/\./g, "/")}.py`);
        }
    }

    return imports;
}

function defaultPythonWorkspacePathForClass(className: string): string {
    return `models/${toSnakeCase(className)}.py`;
}

function defaultPythonWorkspacePathForFunction(functionName: string): string {
    return `services/${toSnakeCase(functionName)}.py`;
}

function inferMethodParamNames(methodName: string, methodArgs: unknown[]): string[] {
    const normalized = methodName.toLowerCase();
    if (methodArgs.length < 1) return [];
    if (methodArgs.length === 1) {
        if (/withdraw|deposit|credit|debit|increase|decrease|add|subtract|spend/.test(normalized)) {
            return ["amount"];
        }
        if (/label|name|title|describe|summary|report/.test(normalized) && typeof methodArgs[0] === "string") {
            return ["label"];
        }
        return [typeof methodArgs[0] === "number" ? "amount" : "value"];
    }
    if (methodArgs.length === 2) {
        if (typeof methodArgs[0] === "string" && typeof methodArgs[1] === "number") {
            return ["label", "amount"];
        }
        return ["value", "amount"];
    }
    return methodArgs.map((_, index) => `arg_${index + 1}`);
}

function inferFunctionParamNames(args: {
    functionName: string;
    checks: SemanticCheck[];
    source: string;
}): string[] {
    const check = args.checks[0];
    if (!check || semanticCheckType(check) !== "function_returns") return [];

    const rawArgs = semanticCheckArray(check, "args");
    const rawKinds = semanticCheckArray(check, "argKinds");
    const normalized = args.functionName.toLowerCase();

    return rawArgs.map((arg, index) => {
        const kind = typeof rawKinds[index] === "string" ? String(rawKinds[index]) : "value";
        if (kind === "dict_entries") {
            if (/account|deposit|withdraw|balance|cover|afford/.test(normalized)) return "account";
            return "item";
        }
        if (kind === "list_of_dict_entries") {
            if (/account|report|summary/.test(normalized)) return "accounts";
            return "items";
        }
        if (Array.isArray(arg)) {
            if (index === 0 && /account|deposit|withdraw|balance|cover|afford/.test(normalized)) return "account";
            return index === 0 ? "value" : `value_${index + 1}`;
        }
        if (typeof arg === "number") {
            if (index === 0 && /format_money|price|cost|amount|total/.test(normalized)) return "amount";
            if (index === 1 && /cover|afford|price|cost/.test(normalized)) return "cost";
            if (index === 1 && /deposit|withdraw|credit|debit|amount|total/.test(normalized)) return "amount";
            return index === 0 ? "amount" : `amount_${index + 1}`;
        }
        if (typeof arg === "string") {
            if (index === 0 && /label|title|name|summary|report/.test(normalized)) return "label";
            return index === 0 ? "value" : `value_${index + 1}`;
        }
        return index === 0 ? "value" : `value_${index + 1}`;
    });
}

function buildStarterClassSkeleton(args: {
    className: string;
    constructorArgs: unknown[];
    attributes: string[];
    returnMethods: SemanticClassMethodPlan[];
    mutators: SemanticClassMutatorPlan[];
}): string {
    const params = inferSemanticConstructorParams({
        source: "",
        className: args.className,
        attributes: args.attributes,
        constructorArgs: args.constructorArgs,
    });
    const constructorAttributes = uniqueOrderedStrings([
        ...args.attributes,
        ...params.filter((param) => !/^value_\d+$/.test(param)),
    ]);

    const lines = [`class ${args.className}:`];
    lines.push(`    def __init__(self${params.length ? `, ${params.join(", ")}` : ""}):`);

    if (constructorAttributes.length > 0) {
        for (const attribute of constructorAttributes) {
            const param = parameterForAttribute({
                attribute,
                attributes: constructorAttributes,
                params,
            });
            lines.push(
                `        self.${attribute} = ${param || defaultLiteralForAttribute(attribute)}`,
            );
        }
    } else {
        lines.push("        pass");
    }

    const emitted = new Set<string>(["__init__"]);
    const methods = uniqueOrderedStrings([
        ...args.returnMethods.map((method) => method.methodName),
        ...args.mutators.map((method) => method.methodName),
    ]);

    for (const methodName of methods) {
        if (!methodName || emitted.has(methodName)) continue;
        emitted.add(methodName);
        const example =
            args.returnMethods.find((method) => method.methodName === methodName) ??
            args.mutators.find((method) => method.methodName === methodName);
        const paramNames = inferMethodParamNames(
            methodName,
            Array.isArray(example?.methodArgs) ? example.methodArgs : [],
        );
        lines.push("");
        lines.push(`    def ${methodName}(self${paramNames.length ? `, ${paramNames.join(", ")}` : ""}):`);
        lines.push("        pass");
    }

    return lines.join("\n");
}

function buildStarterFunctionSkeleton(functionName: string, checks: SemanticCheck[], source: string): string {
    const params = inferFunctionParamNames({ functionName, checks, source });
    return [`def ${functionName}(${params.join(", ")}):`, "    pass"].join("\n");
}

function synthesizeSemanticOopWorkspaceFiles(exercise: PythonCodeInputExercise): {
    exercise: PythonCodeInputExercise;
    changed: boolean;
} {
    if (!isSemanticCodeExercise(exercise)) return { exercise, changed: false };

    const existingStarterFiles = Array.isArray(exercise.starterFiles) ? exercise.starterFiles : [];
    const existingSolutionFiles = Array.isArray(exercise.solutionFiles) ? exercise.solutionFiles : [];
    if (existingStarterFiles.length > 0 || existingSolutionFiles.length > 0) {
        return { exercise, changed: false };
    }

    const checks = Array.isArray(exercise.semanticChecks) ? exercise.semanticChecks : [];
    if (checks.length < 1) return { exercise, changed: false };

    const entryFilePath = String(
        (exercise as { entryFilePath?: unknown }).entryFilePath ?? "main.py",
    );
    const entryStarter = String(exercise.starterCode ?? "").trimEnd();
    const entrySolution = String(exercise.solutionCode ?? exercise.starterCode ?? "").trimEnd();
    const source = [entryStarter, entrySolution].filter(Boolean).join("\n\n");
    const importPaths = extractPythonImportsBySymbol(source);
    const hasFunctionChecks = checks.some((check) => semanticCheckType(check) === "function_returns");

    if (
        !looksLikeOopSemanticStructureExercise(exercise) &&
        !(hasFunctionChecks && importPaths.size > 0)
    ) {
        return { exercise, changed: false };
    }

    const starterFiles: Array<{
        path: string;
        content: string;
        language: "python";
        isEntry: boolean;
        entry: boolean;
    }> = [
        {
            path: entryFilePath,
            content: entryStarter || "# Write your answer below",
            language: "python",
            isEntry: true,
            entry: true,
        },
    ];
    const solutionFiles: Array<{
        path: string;
        content: string;
        language: "python";
        isEntry: boolean;
        entry: boolean;
    }> = [
        {
            path: entryFilePath,
            content: entrySolution || entryStarter || "# Write your answer below",
            language: "python",
            isEntry: true,
            entry: true,
        },
    ];

    const starterByPath = new Map<string, string>();
    const solutionByPath = new Map<string, string>();

    const classPlans = collectSemanticClassImplementationPlans(checks);
    for (const [className, plan] of classPlans) {
        const path = importPaths.get(className) ?? defaultPythonWorkspacePathForClass(className);
        if (path === entryFilePath) continue;
        const starterContent = buildStarterClassSkeleton(plan);
        const solutionContent = starterContent;
        if (!starterByPath.has(path)) starterByPath.set(path, starterContent);
        if (!solutionByPath.has(path)) solutionByPath.set(path, solutionContent);
    }

    const functionChecksByName = new Map<string, SemanticCheck[]>();
    for (const check of checks) {
        if (semanticCheckType(check) !== "function_returns") continue;
        const functionName = semanticCheckString(check, "functionName");
        if (!functionName) continue;
        const group = functionChecksByName.get(functionName) ?? [];
        group.push(check);
        functionChecksByName.set(functionName, group);
    }

    for (const [functionName, groupedChecks] of functionChecksByName) {
        const path = importPaths.get(functionName) ?? defaultPythonWorkspacePathForFunction(functionName);
        if (path === entryFilePath) continue;
        if (classPlans.size > 0 && solutionByPath.has(path)) continue;
        const starterContent = buildStarterFunctionSkeleton(functionName, groupedChecks, source);
        if (!starterByPath.has(path)) starterByPath.set(path, starterContent);
        if (!solutionByPath.has(path)) solutionByPath.set(path, starterContent);
    }

    if (starterByPath.size < 1 && solutionByPath.size < 1) {
        return { exercise, changed: false };
    }

    for (const [path, content] of starterByPath) {
        starterFiles.push({
            path,
            content,
            language: "python",
            isEntry: false,
            entry: false,
        });
    }

    for (const [path, content] of solutionByPath) {
        solutionFiles.push({
            path,
            content,
            language: "python",
            isEntry: false,
            entry: false,
        });
    }

    return {
        exercise: {
            ...exercise,
            entryFilePath,
            starterFiles,
            solutionFiles,
        },
        changed: true,
    };
}


function pythonLiteralForValue(value: unknown): string {
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "True" : "False";
    if (value === null || value === undefined) return "None";
    if (Array.isArray(value)) {
        return `[${value.map((item) => pythonLiteralForValue(item)).join(", ")}]`;
    }
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>).map(
            ([key, item]) => `${pythonLiteralForValue(key)}: ${pythonLiteralForValue(item)}`,
        );
        return `{${entries.join(", ")}}`;
    }
    return JSON.stringify(String(value));
}

type SemanticEntryPlan = {
    className: string;
    constructorArgs: unknown[];
    attributes: string[];
    calls: Array<{ methodName: string; methodArgs: unknown[] }>;
    resultMethods: Array<{ methodName: string; methodArgs: unknown[]; expected: unknown }>;
};

function semanticCheckRecord(check: SemanticCheck): Record<string, unknown> {
    return check as unknown as Record<string, unknown>;
}

function semanticCheckType(check: SemanticCheck): string {
    return String(semanticCheckRecord(check).type ?? "");
}

function semanticCheckString(check: SemanticCheck, field: string): string {
    const value = semanticCheckRecord(check)[field];
    return typeof value === "string" ? value.trim() : "";
}

function semanticCheckArray(check: SemanticCheck, field: string): unknown[] {
    const value = semanticCheckRecord(check)[field];
    return Array.isArray(value) ? value : [];
}

function normalizeSemanticExpectedValue(value: unknown): unknown {
    if (
        Array.isArray(value) &&
        value.length === 1 &&
        !Array.isArray(value[0]) &&
        (value[0] === null || ["string", "number", "boolean"].includes(typeof value[0]))
    ) {
        return value[0];
    }

    return value;
}

function codeHasMeaningfulTopLevelWork(source: string): boolean {
    const meaningful = String(source ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith("#"))
        .filter((line) => !/^from\s+[A-Za-z0-9_.]+\s+import\s+/.test(line))
        .filter((line) => !/^import\s+[A-Za-z0-9_.,\s]+$/.test(line))
        .filter((line) => line !== "pass" && line !== "..." && line !== "n");

    if (meaningful.length < 1) return false;
    return meaningful.some((line) =>
        /=\s*[A-Z][A-Za-z0-9_]*\s*\(/.test(line) ||
        /\bprint\s*\(/.test(line) ||
        /\.[A-Za-z_]\w*\s*\(/.test(line) ||
        /^class\s+[A-Za-z_]\w*\b/.test(line) ||
        /^def\s+[A-Za-z_]\w*\b/.test(line),
    );
}

function modulePathForPythonFile(path: string): string {
    return path
        .replace(/\.py$/, "")
        .split("/")
        .filter(Boolean)
        .join(".");
}

function classDefinedInSource(source: string, className: string): boolean {
    return new RegExp(`^\\s*class\\s+${escapeRegExp(className)}\\b`, "m").test(String(source ?? ""));
}

function classImportedOrDefinedInEntry(entrySource: string, className: string): boolean {
    const source = String(entrySource ?? "");
    return (
        classDefinedInSource(source, className) ||
        new RegExp(`\\bimport\\s+[^\\n]*\\b${escapeRegExp(className)}\\b`).test(source)
    );
}

function findPythonFileForClass(files: Array<{ path: string; content: string }>, className: string): string | null {
    const match = files.find((file) =>
        file.path.endsWith(".py") && classDefinedInSource(file.content, className),
    );
    return match?.path ?? null;
}

function addSemanticEntryPlan(
    plans: Map<string, SemanticEntryPlan[]>,
    className: string,
    constructorArgs: unknown[],
): SemanticEntryPlan {
    const existing = plans.get(className) ?? [];
    const duplicate = existing.find((plan) =>
        JSON.stringify(plan.constructorArgs) === JSON.stringify(constructorArgs),
    );
    if (duplicate) return duplicate;

    const plan: SemanticEntryPlan = {
        className,
        constructorArgs,
        attributes: [],
        calls: [],
        resultMethods: [],
    };
    existing.push(plan);
    plans.set(className, existing);
    return plan;
}

function collectSemanticEntryPlans(args: {
    checks: SemanticCheck[];
    source: string;
}): Map<string, SemanticEntryPlan[]> {
    const plans = new Map<string, SemanticEntryPlan[]>();

    for (const check of args.checks) {
        const type = semanticCheckType(check);
        const className = semanticCheckString(check, "className");
        if (!className) continue;

        if (type === "instance_attributes") {
            const plan = addSemanticEntryPlan(
                plans,
                className,
                semanticCheckArray(check, "constructorArgs"),
            );
            for (const attr of semanticCheckArray(check, "attributes")) {
                const name = typeof attr === "string" ? attr.trim() : "";
                if (name && !plan.attributes.includes(name)) plan.attributes.push(name);
            }
            continue;
        }

        if (type === "constructible") {
            addSemanticEntryPlan(plans, className, semanticCheckArray(check, "constructorArgs"));
            continue;
        }

        if (type === "method_returns") {
            const plan = addSemanticEntryPlan(
                plans,
                className,
                semanticCheckArray(check, "constructorArgs"),
            );
            const methodName = semanticCheckString(check, "methodName");
            if (methodName) {
                plan.resultMethods.push({
                    methodName,
                    methodArgs: semanticCheckArray(check, "methodArgs"),
                    expected: normalizeSemanticExpectedValue(semanticCheckRecord(check).expected),
                });
            }
            continue;
        }

        if (type === "method_sequence_returns") {
            const plan = addSemanticEntryPlan(
                plans,
                className,
                semanticCheckArray(check, "constructorArgs"),
            );
            for (const call of semanticCheckArray(check, "calls")) {
                if (!call || typeof call !== "object") continue;
                const record = call as Record<string, unknown>;
                const methodName = typeof record.methodName === "string" ? record.methodName.trim() : "";
                if (!methodName) continue;
                plan.calls.push({
                    methodName,
                    methodArgs: Array.isArray(record.methodArgs) ? record.methodArgs : [],
                });
            }
            const methodName = semanticCheckString(check, "methodName");
            if (methodName) {
                plan.resultMethods.push({
                    methodName,
                    methodArgs: semanticCheckArray(check, "methodArgs"),
                    expected: normalizeSemanticExpectedValue(semanticCheckRecord(check).expected),
                });
            }
            continue;
        }

        if (type === "attribute_sequence_equals") {
            const plan = addSemanticEntryPlan(
                plans,
                className,
                semanticCheckArray(check, "constructorArgs"),
            );
            for (const call of semanticCheckArray(check, "calls")) {
                if (!call || typeof call !== "object") continue;
                const record = call as Record<string, unknown>;
                const methodName = typeof record.methodName === "string" ? record.methodName.trim() : "";
                if (!methodName) continue;
                plan.calls.push({
                    methodName,
                    methodArgs: Array.isArray(record.methodArgs) ? record.methodArgs : [],
                });
            }
            const attributeName = semanticCheckString(check, "attributeName");
            if (attributeName && !plan.attributes.includes(attributeName)) {
                plan.attributes.push(attributeName);
            }
            continue;
        }
    }

    for (const check of args.checks) {
        if (semanticCheckType(check) !== "created_instances") continue;
        const className = semanticCheckString(check, "className");
        if (!className) continue;
        const min = Number(semanticCheckRecord(check).min ?? 1);
        const existing = plans.get(className) ?? [];
        const target = Number.isFinite(min) && min > 0 ? Math.min(Math.floor(min), 4) : 1;
        while (existing.length < target) {
            const params = extractInitParams(args.source, className);
            const constructorArgs = params.map((param) => parseSimplePythonLiteralForSemantic(pythonLiteralForConstructorParam(param)));
            existing.push({
                className,
                constructorArgs,
                attributes: [],
                calls: [],
                resultMethods: [],
            });
        }
        plans.set(className, existing);
    }

    return plans;
}

function inferRequestedZeroArgCalls(args: {
    promptText: string;
    entrySource: string;
    definition: PythonClassDefinition | undefined;
}): string[] {
    const definition = args.definition;
    if (!definition) return [];
    const text = `${args.promptText}\n${args.entrySource}`.toLowerCase();
    const calls: string[] = [];

    for (const [methodName, methodLines] of definition.methods) {
        if (methodName === "__init__" || methodName.startsWith("_")) continue;
        const signature = methodLines[0] ?? "";
        const params = signature.match(/def\s+[A-Za-z_]\w*\s*\(([^)]*)\)/)?.[1] ?? "";
        const userParams = params
            .split(",")
            .map((part) => part.trim().split(":")[0]?.split("=")[0]?.trim() ?? "")
            .filter((part) => part && part !== "self");
        if (userParams.length > 0) continue;

        const normalizedMethod = methodName.toLowerCase();
        const words = normalizedMethod.split("_").filter(Boolean);
        const mentioned = words.some((word) => word.length >= 3 && text.includes(word));
        const likelyMutator = /^(switch|turn|toggle|mark|complete|finish|start|stop|open|close|activate|deactivate|enable|disable)/.test(normalizedMethod);
        if (mentioned || likelyMutator) calls.push(methodName);
    }

    return calls;
}

function synthesizeEntrySolutionForSemanticOopExercise(exercise: PythonCodeInputExercise): {
    exercise: PythonCodeInputExercise;
    changed: boolean;
} {
    if (!isSemanticCodeExercise(exercise)) return { exercise, changed: false };
    if (!looksLikeOopSemanticStructureExercise(exercise)) return { exercise, changed: false };
    if (!Array.isArray(exercise.solutionFiles) || exercise.solutionFiles.length < 1) {
        return { exercise, changed: false };
    }

    const checks = Array.isArray(exercise.semanticChecks) ? exercise.semanticChecks : [];
    if (!checks.some((check) => ["created_instances", "printed_line_count"].includes(semanticCheckType(check)))) {
        return { exercise, changed: false };
    }

    const entryFilePath = String(
        (exercise as { entryFilePath?: unknown }).entryFilePath ??
        exercise.solutionFiles.find((file) => (file as { isEntry?: unknown }).isEntry === true)?.path ??
        "main.py",
    );
    const solutionFiles = exercise.solutionFiles.map((file) => ({
        ...file,
        path: String((file as { path?: unknown }).path ?? ""),
        content: String((file as { content?: unknown }).content ?? ""),
    }));
    const entryFile = solutionFiles.find((file) => file.path === entryFilePath);
    const entrySource = String(entryFile?.content ?? exercise.solutionCode ?? "");

    if (codeHasMeaningfulTopLevelWork(entrySource)) {
        return { exercise, changed: false };
    }

    const source = solutionFiles.map((file) => `# ${file.path}\n${file.content}`).join("\n\n");
    const plans = collectSemanticEntryPlans({ checks, source });
    if (plans.size < 1) return { exercise, changed: false };

    const definitions = extractPythonClassDefinitions(source);
    const promptText = `${exercise.title ?? ""}\n${exercise.prompt ?? ""}`;
    const importLines = entrySource
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => /^\s*(from\s+[A-Za-z0-9_.]+\s+import\s+|import\s+[A-Za-z0-9_.]+)/.test(line));
    const bodyLines: string[] = [];
    const printableExpressions: string[] = [];
    const usedVarNames = new Set<string>();

    function uniqueVarName(className: string, index: number): string {
        const base = `${variableNameForClass(className)}_${index + 1}`;
        if (!usedVarNames.has(base)) {
            usedVarNames.add(base);
            return base;
        }
        let suffix = index + 2;
        while (usedVarNames.has(`${base}_${suffix}`)) suffix += 1;
        const name = `${base}_${suffix}`;
        usedVarNames.add(name);
        return name;
    }

    for (const [className, classPlans] of plans) {
        if (!classImportedOrDefinedInEntry(importLines.join("\n"), className)) {
            const path = findPythonFileForClass(solutionFiles, className);
            if (path && path !== entryFilePath) {
                importLines.push(`from ${modulePathForPythonFile(path)} import ${className}`);
            }
        }

        const definition = definitions.find((item) => item.name === className);
        const requestedCalls = inferRequestedZeroArgCalls({
            promptText,
            entrySource,
            definition,
        });

        classPlans.forEach((plan, index) => {
            const varName = uniqueVarName(className, index);
            bodyLines.push(
                `${varName} = ${className}(${plan.constructorArgs.map((arg) => pythonLiteralForValue(arg)).join(", ")})`,
            );

            const allCalls = [...plan.calls];
            for (const methodName of requestedCalls) {
                if (!allCalls.some((call) => call.methodName === methodName)) {
                    allCalls.push({ methodName, methodArgs: [] });
                }
            }
            for (const call of allCalls) {
                bodyLines.push(
                    `${varName}.${call.methodName}(${call.methodArgs.map((arg) => pythonLiteralForValue(arg)).join(", ")})`,
                );
            }

            for (const result of plan.resultMethods) {
                if (result.expected === null || result.expected === undefined) {
                    bodyLines.push(
                        `${varName}.${result.methodName}(${result.methodArgs.map((arg) => pythonLiteralForValue(arg)).join(", ")})`,
                    );
                } else {
                    printableExpressions.push(
                        `${varName}.${result.methodName}(${result.methodArgs.map((arg) => pythonLiteralForValue(arg)).join(", ")})`,
                    );
                }
            }

            const preferredAttr = plan.attributes.find((attr) => /^(name|title|label|status|is_on|balance|room)$/i.test(attr)) ?? plan.attributes[0];
            if (preferredAttr) printableExpressions.push(`${varName}.${preferredAttr}`);
        });
    }

    const printedLineMin = Math.max(
        0,
        ...checks
            .filter((check) => semanticCheckType(check) === "printed_line_count")
            .map((check) => Number(semanticCheckRecord(check).min ?? 1))
            .filter((value) => Number.isFinite(value)),
    );
    let printCount = 0;
    for (const expression of printableExpressions) {
        if (printCount >= printedLineMin && printedLineMin > 0) break;
        bodyLines.push(`print(${expression})`);
        printCount += 1;
    }
    while (printCount < printedLineMin) {
        const fallback = printableExpressions[0] ?? "'done'";
        bodyLines.push(`print(${fallback})`);
        printCount += 1;
    }

    if (bodyLines.length < 1) return { exercise, changed: false };

    const nextEntrySource = [...new Set(importLines), "", ...bodyLines].join("\n").trimEnd();
    const nextSolutionFiles = solutionFiles.map((file) =>
        file.path === entryFilePath ? { ...file, content: nextEntrySource } : file,
    );

    return {
        exercise: {
            ...exercise,
            entryFilePath,
            solutionCode: nextEntrySource,
            solutionFiles: nextSolutionFiles,
        },
        changed: true,
    };
}


function classSolutionLooksIncompleteForSemantic(source: string, className: string): boolean {
    const definition = extractPythonClassDefinitions(source).find((item) => item.name === className);
    if (!definition) return false;

    const classBody = String(source ?? "");
    if (/\bpass\b|\.\.\.|#\s*(store|return|increase|decrease|add|subtract|set|complete|TODO|write|implement)/i.test(classBody)) {
        return true;
    }

    for (const [, methodLines] of definition.methods) {
        const body = methodLines.slice(1).join("\n").trim();
        const meaningful = body
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => !line.startsWith("#"));
        if (meaningful.length < 1) return true;
    }

    return false;
}

function methodDefinedInSource(source: string, methodName: string): boolean {
    return new RegExp(`^\\s+def\\s+${escapeRegExp(methodName)}\\s*\\(`, "m").test(String(source ?? ""));
}

function extractMethodSource(source: string, methodName: string): string {
    const escaped = escapeRegExp(methodName);
    const pattern = new RegExp(`def\\s+${escaped}\\s*\\([^)]*\\):[\\s\\S]*?(?=\\n\\s+def\\s+|\\nclass\\s+|(?![\\s\\S]))`, "m");
    return String(source ?? "").match(pattern)?.[0] ?? "";
}

function semanticClassPlanNeedsRegeneration(args: {
    source: string;
    className: string;
    plan: SemanticClassImplementationPlan;
}): boolean {
    if (classSolutionLooksIncompleteForSemantic(args.source, args.className)) return true;
    const constructorParams = extractInitParams(args.source, args.className);

    const requiredMethods = uniqueOrderedStrings([
        ...args.plan.returnMethods.map((method) => method.methodName),
        ...args.plan.mutators.map((method) => method.methodName),
    ]);

    for (const methodName of requiredMethods) {
        if (methodName && !methodDefinedInSource(args.source, methodName)) return true;
    }

    const duplicateReturnMethods = new Map<string, SemanticClassMethodPlan[]>();
    for (const method of args.plan.returnMethods) {
        const group = duplicateReturnMethods.get(method.methodName) ?? [];
        group.push(method);
        duplicateReturnMethods.set(method.methodName, group);
    }

    for (const [methodName, examples] of duplicateReturnMethods) {
        const methodSource = extractMethodSource(args.source, methodName);
        if (!methodSource) return true;
        const normalizedMethod = methodName.toLowerCase();

        if (
            examples.length > 1 &&
            /return\s+(True|False|-?\d+(?:\.\d+)?|["']).*$/m.test(methodSource) &&
            !/self\./.test(methodSource)
        ) {
            return true;
        }

        const methodIsPlannedMutator = args.plan.mutators.some(
            (mutator) => mutator.methodName === methodName,
        );
        if (
            methodIsPlannedMutator &&
            methodNameLooksLikeNumericMutator(methodName) &&
            !/self\.[A-Za-z_]\w*\s*[-+]=/.test(methodSource)
        ) {
            return true;
        }

        if (methodNameLooksLikeBooleanPredicate(methodName) && !/return\b[\s\S]*(self\.|arg_|amount|value)/.test(methodSource)) {
            return true;
        }

        if (/rename/.test(normalizedMethod) && !/\.strip\(\)/.test(methodSource)) {
            return true;
        }

        if (/^set_/.test(normalizedMethod) && /\+=|-=/.test(methodSource)) {
            return true;
        }
    }

    for (const attribute of args.plan.attributes) {
        if (!attribute || constructorParams.includes(attribute)) continue;
        if (!/^(available|is_|has_)/.test(attribute)) continue;
        const attrPattern = new RegExp(`self\\.${escapeRegExp(attribute)}\\s*=\\s*(True|False)`);
        if (!attrPattern.test(args.source)) {
            return true;
        }
    }

    for (const mutator of args.plan.mutators) {
        const methodName = String(mutator.methodName ?? "").toLowerCase();
        if (!/^(withdraw|debit|decrease|decrement|remove|subtract)$/.test(methodName)) continue;
        const escaped = escapeRegExp(mutator.methodName);
        const methodPattern = new RegExp(`def\\s+${escaped}\\s*\\([^)]*\\):[\\s\\S]*?(?=\\n\\s+def\\s+|\\nclass\\s+|(?![\\s\\S]))`, "m");
        const match = args.source.match(methodPattern);
        const methodSource = match?.[0] ?? "";
        if (methodSource && !/\bif\b[\s\S]*<=/.test(methodSource)) return true;
    }

    return false;
}

type SemanticClassMethodPlan = {
    methodName: string;
    constructorArgs: unknown[];
    methodArgs: unknown[];
    expected: unknown;
};

type SemanticClassMutatorPlan = {
    methodName: string;
    methodArgs: unknown[];
    attributeName: string;
    expected: unknown;
};

type SemanticClassImplementationPlan = {
    className: string;
    constructorArgs: unknown[];
    attributes: string[];
    returnMethods: SemanticClassMethodPlan[];
    mutators: SemanticClassMutatorPlan[];
};

function collectSemanticClassImplementationPlans(checks: SemanticCheck[]): Map<string, SemanticClassImplementationPlan> {
    const plans = new Map<string, SemanticClassImplementationPlan>();

    function getPlan(className: string): SemanticClassImplementationPlan {
        const existing = plans.get(className);
        if (existing) return existing;
        const plan: SemanticClassImplementationPlan = {
            className,
            constructorArgs: [],
            attributes: [],
            returnMethods: [],
            mutators: [],
        };
        plans.set(className, plan);
        return plan;
    }

    for (const check of checks) {
        const className = semanticCheckString(check, "className");
        if (!className) continue;
        const plan = getPlan(className);
        const type = semanticCheckType(check);
        const constructorArgs = semanticCheckArray(check, "constructorArgs");
        if (plan.constructorArgs.length < 1 && constructorArgs.length > 0) {
            plan.constructorArgs = constructorArgs;
        }

        if (type === "instance_attributes") {
            for (const attr of semanticCheckArray(check, "attributes")) {
                const name = typeof attr === "string" ? attr.trim() : "";
                if (name && !plan.attributes.includes(name)) plan.attributes.push(name);
            }
            continue;
        }

        if (type === "method_returns") {
            const methodName = semanticCheckString(check, "methodName");
            if (methodName && methodName !== "__init__") {
                plan.returnMethods.push({
                    methodName,
                    constructorArgs,
                    methodArgs: semanticCheckArray(check, "methodArgs"),
                    expected: normalizeSemanticExpectedValue(semanticCheckRecord(check).expected),
                });
            }
            continue;
        }

        if (type === "method_sequence_returns") {
            const methodName = semanticCheckString(check, "methodName");
            if (methodName && methodName !== "__init__") {
                plan.returnMethods.push({
                    methodName,
                    constructorArgs,
                    methodArgs: semanticCheckArray(check, "methodArgs"),
                    expected: normalizeSemanticExpectedValue(semanticCheckRecord(check).expected),
                });
            }

            for (const call of semanticCheckArray(check, "calls")) {
                if (!call || typeof call !== "object") continue;
                const record = call as Record<string, unknown>;
                const callMethodName = typeof record.methodName === "string" ? record.methodName.trim() : "";
                if (!callMethodName || callMethodName === "__init__") continue;
                const callArgs = Array.isArray(record.methodArgs) ? record.methodArgs : [];
                const attributeName = inferSemanticMutatorAttribute({
                    methodName: callMethodName,
                    methodArgs: callArgs,
                    attributes: plan.attributes,
                    expected: normalizeSemanticExpectedValue(semanticCheckRecord(check).expected),
                });
                if (!attributeName) continue;
                plan.mutators.push({
                    methodName: callMethodName,
                    methodArgs: callArgs,
                    attributeName,
                    expected: normalizeSemanticExpectedValue(semanticCheckRecord(check).expected),
                });
                if (!plan.attributes.includes(attributeName)) plan.attributes.push(attributeName);
            }
            continue;
        }

        if (type === "attribute_sequence_equals") {
            const attributeName = semanticCheckString(check, "attributeName");
            for (const call of semanticCheckArray(check, "calls")) {
                if (!call || typeof call !== "object") continue;
                const record = call as Record<string, unknown>;
                const methodName = typeof record.methodName === "string" ? record.methodName.trim() : "";
                if (!methodName || !attributeName) continue;
                plan.mutators.push({
                    methodName,
                    methodArgs: Array.isArray(record.methodArgs) ? record.methodArgs : [],
                    attributeName,
                    expected: normalizeSemanticExpectedValue(semanticCheckRecord(check).expected),
                });
                if (!plan.attributes.includes(attributeName)) plan.attributes.push(attributeName);
            }
        }
    }

    return plans;
}

function inferSemanticMutatorAttribute(args: {
    methodName: string;
    methodArgs: unknown[];
    attributes: string[];
    expected: unknown;
}): string {
    const methodName = String(args.methodName ?? "").toLowerCase();
    const attrs = args.attributes.map((attr) => String(attr ?? "").trim()).filter(Boolean);

    function findAttr(pattern: RegExp): string {
        return attrs.find((attr) => pattern.test(attr.toLowerCase())) ?? "";
    }

    if (/rename|name/.test(methodName)) return findAttr(/name|title|label|owner/) || attrs[attrs.length - 1] || "name";
    if (/checkout|copy|copies/.test(methodName)) return findAttr(/copies|copy|count|available|stock/) || "copies";
    if (/complete|task/.test(methodName)) return findAttr(/completed|complete|count|total|done/) || "completed";
    if (/deposit|withdraw|balance|credit|debit/.test(methodName)) return findAttr(/balance|amount|total/) || "balance";
    if (/increment|decrement|increase|decrease|add|remove|subtract/.test(methodName)) {
        return findAttr(/count|completed|copies|balance|amount|total|score|quantity|stock/) || attrs.find((attr) => typeof args.expected === "number" || /count|total/i.test(attr)) || attrs[attrs.length - 1] || "count";
    }
    if (args.methodArgs.length > 0) return attrs[attrs.length - 1] || "value";
    return "";
}

function uniqueOrderedStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const trimmed = String(value ?? "").trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        result.push(trimmed);
    }
    return result;
}

function inferSemanticConstructorParams(args: {
    source: string;
    className: string;
    attributes: string[];
    constructorArgs: unknown[];
}): string[] {
    const fromSource = extractInitParams(args.source, args.className);
    if (fromSource.length > 0) return fromSource;
    if (args.attributes.length >= args.constructorArgs.length && args.constructorArgs.length > 0) {
        return args.attributes.slice(0, args.constructorArgs.length);
    }
    if (args.attributes.length > 0) return args.attributes;
    return args.constructorArgs.map((_, index) => `value_${index + 1}`);
}

function parameterForAttribute(args: {
    attribute: string;
    attributes: string[];
    params: string[];
}): string {
    const exactParam = args.params.find((param) => param === args.attribute);
    if (exactParam) return exactParam;
    const attrIndex = args.attributes.indexOf(args.attribute);
    if (
        args.attributes.length === args.params.length &&
        attrIndex >= 0 &&
        args.params[attrIndex]
    ) {
        return args.params[attrIndex]!;
    }
    return "";
}

function defaultLiteralForAttribute(attribute: string): string {
    const normalized = String(attribute ?? "").toLowerCase();
    if (/^(is_|has_|can_)/.test(normalized) || normalized === "available") {
        return "True";
    }
    if (/transactions|items|entries|records|logs|history|list/.test(normalized)) {
        return "[]";
    }
    if (/count|total|balance|amount|score|stock|quantity|copies/.test(normalized)) {
        return "0";
    }
    return "None";
}

function semanticPlanNeedsNonNegativeBalance(args: {
    plan: SemanticClassImplementationPlan;
    params: string[];
}): boolean {
    const balanceIndex = args.params.findIndex((param) => /balance|amount|total/i.test(param));
    if (balanceIndex < 0) return false;
    if (!args.plan.attributes.some((attr) => /balance|amount|total/i.test(attr))) return false;
    return args.plan.constructorArgs.some((value, index) => index === balanceIndex && typeof value === "number" && value < 0);
}

function buildPythonFStringReturnExpression(args: {
    expected: unknown;
    params: string[];
    attributes: string[];
    constructorArgs: unknown[];
    methodArgs?: unknown[];
    methodParams?: string[];
}): string {
    if (typeof args.expected !== "string") {
        return pythonLiteralForValue(args.expected);
    }

    let template = args.expected;
    const replacements: Array<{ raw: string; expression: string }> = [];

    args.params.forEach((param, index) => {
        const value = args.constructorArgs[index];
        const attribute = args.attributes.includes(param) ? param : args.attributes[index] ?? param;
        if (value === undefined || value === null) return;
        replacements.push({ raw: String(value), expression: `{self.${attribute}}` });
    });

    (args.methodParams ?? []).forEach((param, index) => {
        const value = args.methodArgs?.[index];
        if (value === undefined || value === null) return;
        replacements.push({ raw: String(value), expression: `{${param}}` });
    });

    const methodHasNumericValue = (args.methodArgs ?? []).some(
        (value) => typeof value === "number" && String(args.expected).includes(String(value)),
    );

    if (!methodHasNumericValue && args.attributes.some((attr) => /balance|amount|total|count/i.test(attr))) {
        const numericAttr = args.attributes.find((attr) => /balance|amount|total|count/i.test(attr));
        if (numericAttr) {
            template = template.replace(/\$-?\d+(?:\.\d+)?/g, (match) => {
                const formatSuffix = match.includes(".") ? ":.2f" : "";
                return "$" + `{self.${numericAttr}${formatSuffix}}`;
            });
            template = template.replace(/(?<=:\s*)-?\d+(?:\.\d+)?/g, `{self.${numericAttr}}`);
        }
    }

    for (const replacement of replacements.sort((a, b) => b.raw.length - a.raw.length)) {
        if (!replacement.raw) continue;
        template = template.split(replacement.raw).join(replacement.expression);
    }

    if (/\{(?:self\.)?[A-Za-z_]\w*(?::[^}]*)?\}/.test(template)) {
        return `f${pythonLiteralForValue(template)}`;
    }

    return pythonLiteralForValue(args.expected);
}

function methodNameLooksLikeNumericMutator(methodName: string): boolean {
    return /^(deposit|credit|add|increase|increment|withdraw|debit|decrease|decrement|subtract|spend|remove|set|update|change)(?:_|$)/.test(
        String(methodName ?? "").toLowerCase(),
    );
}

function methodNameLooksLikeBooleanPredicate(methodName: string): boolean {
    return /^(is_|can_|has_|validate|valid|allows?|should_)/.test(
        String(methodName ?? "").toLowerCase(),
    );
}

function methodNameLooksLikeFormatter(methodName: string): boolean {
    return /summary|label|describe|description|receipt|report|record|format|display/.test(
        String(methodName ?? "").toLowerCase(),
    );
}

function methodNameLooksLikePureArithmeticMethod(args: {
    methodName: string;
    methodArgs: unknown[];
    attributes: string[];
    hasMatchingMutators: boolean;
}): boolean {
    if (args.hasMatchingMutators) return false;
    if (args.attributes.length > 0) return false;
    if (args.methodArgs.length < 2) return false;
    return /^(add|sum|subtract|minus|multiply|divide)$/.test(
        String(args.methodName ?? "").toLowerCase(),
    );
}

function buildPureArithmeticReturnMethod(args: {
    methodName: string;
    methodParams: string[];
    expected: unknown;
}): string[] {
    const methodName = args.methodName;
    const normalized = methodName.toLowerCase();
    const [left = "value", right = "amount"] = args.methodParams;
    const lines = [`    def ${methodName}(self${args.methodParams.length ? `, ${args.methodParams.join(", ")}` : ""}):`];

    if (/^(add|sum)$/.test(normalized)) {
        lines.push(`        return ${left} + ${right}`);
        return lines;
    }

    if (/^(subtract|minus)$/.test(normalized)) {
        lines.push(`        return ${left} - ${right}`);
        return lines;
    }

    if (normalized === "multiply") {
        lines.push(`        return ${left} * ${right}`);
        return lines;
    }

    if (normalized === "divide") {
        lines.push(`        if ${right} == 0:`);
        lines.push("            return None");
        lines.push(`        return ${left} / ${right}`);
        return lines;
    }

    lines.push(`        return ${pythonLiteralForValue(args.expected)}`);
    return lines;
}

function buildBooleanSemanticMethod(args: {
    methodName: string;
    methodArgs: unknown[];
    methodParams: string[];
    attributes: string[];
}): string[] {
    const lines = [`    def ${args.methodName}(self${args.methodParams.length ? `, ${args.methodParams.join(", ")}` : ""}):`];
    const numericAttribute = args.attributes.find((attr) =>
        /amount|balance|total|count|score|quantity|price|stock/i.test(attr),
    );

    if (args.methodParams.length > 0 && /withdraw|spend|debit/.test(args.methodName.toLowerCase()) && numericAttribute) {
        const amountParam = args.methodParams[0] ?? "amount";
        lines.push(`        return ${amountParam} > 0 and ${amountParam} <= self.${numericAttribute}`);
        return lines;
    }

    if (numericAttribute) {
        lines.push(`        return self.${numericAttribute} > 0`);
        return lines;
    }

    const stringAttribute = args.attributes.find((attr) =>
        /name|title|label|status|description/i.test(attr),
    );
    if (stringAttribute) {
        lines.push(`        return bool(self.${stringAttribute})`);
        return lines;
    }

    lines.push("        return True");
    return lines;
}

function buildFormatterSemanticMethod(args: {
    methodName: string;
    methodArgs: unknown[];
    methodParams: string[];
    expected: unknown;
    params: string[];
    attributes: string[];
    constructorArgs: unknown[];
}): string[] {
    return [
        `    def ${args.methodName}(self${args.methodParams.length ? `, ${args.methodParams.join(", ")}` : ""}):`,
        `        return ${buildPythonFStringReturnExpression({
            expected: args.expected,
            params: args.params,
            attributes: args.attributes,
            constructorArgs: args.constructorArgs,
            methodArgs: args.methodArgs,
            methodParams: args.methodParams,
        })}`,
    ];
}

function buildNumericMutatorReturnMethod(args: {
    methodName: string;
    methodArgs: unknown[];
    methodParams: string[];
    attributes: string[];
    expecteds: unknown[];
}): string[] {
    const attributeName =
        inferSemanticMutatorAttribute({
            methodName: args.methodName,
            methodArgs: args.methodArgs,
            attributes: args.attributes,
            expected: args.expecteds[0],
        }) || args.attributes.find((attr) => /balance|amount|total|count/i.test(attr)) || "balance";
    const paramName = args.methodParams[0] ?? "amount";
    const lines = [`    def ${args.methodName}(self${args.methodParams.length ? `, ${args.methodParams.join(", ")}` : ""}):`];
    const normalized = args.methodName.toLowerCase();
    const returnsWarning = args.expecteds.some((expected) => typeof expected === "string");

    if (/^(deposit|credit|add|increase|increment)$/.test(normalized)) {
        lines.push(`        self.${attributeName} += ${paramName}`);
        lines.push(`        return self.${attributeName}`);
        return lines;
    }

    if (/^(withdraw|debit|decrease|decrement|subtract|spend|remove)$/.test(normalized)) {
        if (returnsWarning) {
            const warning = args.expecteds.find((expected) => typeof expected === "string") ?? "Not enough funds";
            lines.push(`        if ${paramName} > self.${attributeName}:`);
            lines.push(`            return ${pythonLiteralForValue(warning)}`);
        }
        lines.push(`        self.${attributeName} -= ${paramName}`);
        lines.push(`        return self.${attributeName}`);
        return lines;
    }

    lines.push(`        self.${attributeName} += ${paramName}`);
    lines.push(`        return self.${attributeName}`);
    return lines;
}

function buildValidatedStatefulReturnMethod(args: {
    methodName: string;
    methodArgs: unknown[];
    methodParams: string[];
    attributes: string[];
    expecteds: unknown[];
}): string[] {
    const normalized = args.methodName.toLowerCase();
    const attributeName =
        inferSemanticMutatorAttribute({
            methodName: args.methodName,
            methodArgs: args.methodArgs,
            attributes: args.attributes,
            expected: args.expecteds[0],
        }) ||
        args.attributes.find((attr) => /username|name|title|label|score|stock|balance|available/i.test(attr)) ||
        args.attributes[0] ||
        "value";
    const paramName = args.methodParams[0] ?? "value";
    const success = args.expecteds.find(
        (expected) => expected === true || expected === "updated" || expected === "checked out",
    );
    const failure = args.expecteds.find(
        (expected) => expected === false || expected === "rejected" || expected === "unavailable",
    );
    const successLiteral = success !== undefined ? pythonLiteralForValue(success) : "True";
    const failureLiteral = failure !== undefined ? pythonLiteralForValue(failure) : "False";
    const lines = [`    def ${args.methodName}(self${args.methodParams.length ? `, ${args.methodParams.join(", ")}` : ""}):`];

    if (/checkout/.test(normalized) || attributeName === "available") {
        const checkoutFailure =
            failure !== undefined
                ? failureLiteral
                : success === "checked out"
                    ? '"unavailable"'
                    : "False";
        lines.push(`        if self.${attributeName}:`);
        lines.push(`            self.${attributeName} = False`);
        lines.push(`            return ${successLiteral}`);
        lines.push(`        return ${checkoutFailure}`);
        return lines;
    }

    if (/rename/.test(normalized) || /username|name|title|label/.test(attributeName)) {
        lines.push(`        cleaned = ${paramName}.strip()`);
        lines.push("        if cleaned:");
        lines.push(`            self.${attributeName} = cleaned`);
        lines.push(`            return ${successLiteral}`);
        lines.push(`        return ${failureLiteral}`);
        return lines;
    }

    if (/^set_/.test(normalized)) {
        lines.push(`        if ${paramName} >= 0:`);
        lines.push(`            self.${attributeName} = ${paramName}`);
        lines.push(`            return ${successLiteral}`);
        lines.push(`        return ${failureLiteral}`);
        return lines;
    }

    if (/score/.test(attributeName) || /score/.test(normalized)) {
        lines.push(`        if 0 <= ${paramName} <= 100:`);
        lines.push(`            self.${attributeName} = ${paramName}`);
        lines.push(`            return ${successLiteral}`);
        lines.push(`        return ${failureLiteral}`);
        return lines;
    }

    if (/stock|copies|quantity/.test(attributeName) || /remove|withdraw|spend|debit/.test(normalized)) {
        lines.push(`        if ${paramName} > 0 and ${paramName} <= self.${attributeName}:`);
        lines.push(`            self.${attributeName} -= ${paramName}`);
        lines.push(`            return ${successLiteral}`);
        lines.push(`        return ${failureLiteral}`);
        return lines;
    }

    if (/balance|amount|total/.test(attributeName) || /deposit|credit|add|increase/.test(normalized)) {
        lines.push(`        if ${paramName} > 0:`);
        lines.push(`            self.${attributeName} += ${paramName}`);
        lines.push(`            return ${successLiteral}`);
        lines.push(`        return ${failureLiteral}`);
        return lines;
    }

    if (/set|update|change/.test(normalized)) {
        lines.push(`        self.${attributeName} = ${paramName}`);
        lines.push(`        return ${successLiteral}`);
        return lines;
    }

    lines.push(`        return ${successLiteral}`);
    return lines;
}

function buildSemanticMutatorMethod(args: {
    methodName: string;
    attributeName: string;
    methodArgs: unknown[];
    expected?: unknown;
    expecteds?: unknown[];
}): string[] {
    const methodName = args.methodName;
    const attributeName = args.attributeName;
    const normalized = methodName.toLowerCase();
    const hasExplicitArg = args.methodArgs.length > 0;
    const paramName = /name|title|label|owner/.test(attributeName) ? "value" : "amount";
    const lines = [`    def ${methodName}(self${hasExplicitArg ? `, ${paramName}` : ""}):`];
    const operand = hasExplicitArg ? paramName : "1";
    const allExpecteds = args.expecteds ?? [args.expected];

    if (
        /transactions|items|entries|records|logs|history|list/i.test(attributeName) &&
        hasExplicitArg
    ) {
        lines.push(`        self.${attributeName}.append(${paramName})`);
        lines.push(`        return self.${attributeName}`);
        return lines;
    }

    if (/^(deposit|credit|increase|increment|add|record|complete)/.test(normalized)) {
        lines.push(`        self.${attributeName} += ${operand}`);
        lines.push(`        return self.${attributeName}`);
        return lines;
    }

    if (/^(withdraw|debit|decrease|decrement|remove|subtract|checkout)/.test(normalized)) {
        if (hasExplicitArg) {
            if (allExpecteds.some((expected) => typeof expected === "string")) {
                const warning = allExpecteds.find((expected) => typeof expected === "string") ?? "Not enough funds";
                lines.push(`        if ${paramName} > self.${attributeName}:`);
                lines.push(`            return ${pythonLiteralForValue(warning)}`);
                lines.push(`        self.${attributeName} -= ${paramName}`);
            } else {
                lines.push(`        if ${paramName} <= self.${attributeName}:`);
                lines.push(`            self.${attributeName} -= ${paramName}`);
            }
        } else {
            lines.push(`        self.${attributeName} -= ${operand}`);
        }
        lines.push(`        return self.${attributeName}`);
        return lines;
    }

    if (/^(set|update|change|rename)/.test(normalized)) {
        lines.push(`        self.${attributeName} = ${hasExplicitArg ? paramName : pythonLiteralForValue(args.methodArgs[0] ?? "")}`);
        lines.push(`        return self.${attributeName}`);
        return lines;
    }

    if (hasExplicitArg) {
        lines.push(`        self.${attributeName} = ${paramName}`);
        lines.push(`        return self.${attributeName}`);
    } else {
        lines.push(`        self.${attributeName} += 1`);
        lines.push(`        return self.${attributeName}`);
    }
    return lines;
}

function synthesizeSemanticClassImplementation(args: {
    originalSource: string;
    plan: SemanticClassImplementationPlan;
}): string | null {
    const plan = args.plan;
    const params = inferSemanticConstructorParams({
        source: args.originalSource,
        className: plan.className,
        attributes: plan.attributes,
        constructorArgs: plan.constructorArgs,
    });
    const attributes = uniqueOrderedStrings([
        ...plan.attributes,
        ...params.filter((param) => !/^value_\d+$/.test(param)),
    ]);

    const lines: string[] = [`class ${plan.className}:`];
    const initParams = params.join(", ");
    lines.push(`    def __init__(self${initParams ? `, ${initParams}` : ""}):`);

    const clampBalance = semanticPlanNeedsNonNegativeBalance({ plan, params });
    for (const attribute of attributes) {
        const param = parameterForAttribute({ attribute, attributes, params });
        if (!param) {
            lines.push(`        self.${attribute} = ${defaultLiteralForAttribute(attribute)}`);
            continue;
        }
        if (clampBalance && /balance|amount|total/i.test(attribute)) {
            lines.push(`        self.${attribute} = ${param} if ${param} >= 0 else 0`);
        } else {
            lines.push(`        self.${attribute} = ${param}`);
        }
    }
    if (attributes.length < 1) lines.push("        pass");

    const emittedMethods = new Set<string>(["__init__"]);
    const returnMethodsByName = new Map<string, SemanticClassMethodPlan[]>();
    for (const method of plan.returnMethods) {
        const existing = returnMethodsByName.get(method.methodName) ?? [];
        existing.push(method);
        returnMethodsByName.set(method.methodName, existing);
    }

    for (const [methodName, examples] of returnMethodsByName) {
        if (!methodName || emittedMethods.has(methodName)) continue;
        emittedMethods.add(methodName);
        const firstExample = examples[0]!;
        const methodParams = inferMethodParamNames(methodName, firstExample.methodArgs);
        const expecteds = examples.map((example) => example.expected);
        const matchingMutators = plan.mutators.filter((mutator) => mutator.methodName === methodName);
        let methodLines: string[];

        if (
            matchingMutators.length > 0 &&
            expecteds.every(
                (value) =>
                    typeof value === "boolean" ||
                    value === "updated" ||
                    value === "rejected" ||
                    value === "checked out" ||
                    value === "unavailable",
            )
        ) {
            methodLines = buildValidatedStatefulReturnMethod({
                methodName,
                methodArgs: firstExample.methodArgs,
                methodParams,
                attributes,
                expecteds,
            });
        } else if (
            methodNameLooksLikePureArithmeticMethod({
                methodName,
                methodArgs: firstExample.methodArgs,
                attributes,
                hasMatchingMutators: matchingMutators.length > 0,
            })
        ) {
            methodLines = buildPureArithmeticReturnMethod({
                methodName,
                methodParams,
                expected: firstExample.expected,
            });
        } else if (methodNameLooksLikeNumericMutator(methodName) && (matchingMutators.length > 0 || attributes.length > 0)) {
            methodLines = buildNumericMutatorReturnMethod({
                methodName,
                methodArgs: firstExample.methodArgs,
                methodParams,
                attributes,
                expecteds,
            });
        } else if (methodNameLooksLikeBooleanPredicate(methodName) && expecteds.every((value) => typeof value === "boolean")) {
            methodLines = buildBooleanSemanticMethod({
                methodName,
                methodArgs: firstExample.methodArgs,
                methodParams,
                attributes,
            });
        } else if (
            methodNameLooksLikeFormatter(methodName) ||
            expecteds.some((expected) => typeof expected === "string") ||
            examples.length > 1
        ) {
            methodLines = buildFormatterSemanticMethod({
                methodName,
                methodArgs: firstExample.methodArgs,
                methodParams,
                expected: firstExample.expected,
                params,
                attributes,
                constructorArgs: firstExample.constructorArgs.length > 0
                    ? firstExample.constructorArgs
                    : plan.constructorArgs,
            });
        } else {
            methodLines = [
                `    def ${methodName}(self${methodParams.length ? `, ${methodParams.join(", ")}` : ""}):`,
                `        return ${buildPythonFStringReturnExpression({
                    expected: firstExample.expected,
                    params,
                    attributes,
                    constructorArgs: firstExample.constructorArgs.length > 0
                        ? firstExample.constructorArgs
                        : plan.constructorArgs,
                    methodArgs: firstExample.methodArgs,
                    methodParams,
                })}`,
            ];
        }

        lines.push("");
        lines.push(...methodLines);
    }

    const mutatorsByName = new Map<string, SemanticClassMutatorPlan[]>();
    for (const mutator of plan.mutators) {
        const existing = mutatorsByName.get(mutator.methodName) ?? [];
        existing.push(mutator);
        mutatorsByName.set(mutator.methodName, existing);
    }

    for (const [methodName, mutatorExamples] of mutatorsByName) {
        if (!methodName || emittedMethods.has(methodName)) continue;
        emittedMethods.add(methodName);
        const firstMutator = mutatorExamples[0]!;
        lines.push("");
        lines.push(...buildSemanticMutatorMethod({
            methodName,
            attributeName: firstMutator.attributeName,
            methodArgs: firstMutator.methodArgs,
            expected: firstMutator.expected,
            expecteds: mutatorExamples.map((example) => example.expected),
        }));
    }

    return lines.join("\n");
}

function completeSemanticOopSolutionClassFiles(exercise: PythonCodeInputExercise): {
    exercise: PythonCodeInputExercise;
    changed: boolean;
} {
    if (!isSemanticCodeExercise(exercise)) return { exercise, changed: false };
    if (!looksLikeOopSemanticStructureExercise(exercise)) return { exercise, changed: false };
    if (!Array.isArray(exercise.solutionFiles) || exercise.solutionFiles.length < 1) {
        return { exercise, changed: false };
    }

    const checks = Array.isArray(exercise.semanticChecks) ? exercise.semanticChecks : [];
    const plans = collectSemanticClassImplementationPlans(checks);
    if (plans.size < 1) return { exercise, changed: false };

    let changed = false;
    const nextSolutionFiles = exercise.solutionFiles.map((file) => {
        const path = String((file as { path?: unknown }).path ?? "");
        const content = String((file as { content?: unknown }).content ?? "");
        if (!path.endsWith(".py")) {
            return file;
        }

        let nextContent = content;
        for (const [className, plan] of plans) {
            if (!classDefinedInSource(nextContent, className)) continue;
            if (!semanticClassPlanNeedsRegeneration({
                source: nextContent,
                className,
                plan,
            })) {
                continue;
            }
            const implementation = synthesizeSemanticClassImplementation({
                originalSource: nextContent,
                plan,
            });
            if (!implementation) continue;
            nextContent = implementation;
            changed = true;
        }

        return nextContent === content ? file : { ...file, content: nextContent };
    });

    if (!changed) return { exercise, changed: false };

    return {
        exercise: {
            ...exercise,
            solutionFiles: nextSolutionFiles,
        },
        changed: true,
    };
}


function functionDefinedInSource(source: string, functionName: string): boolean {
    return new RegExp(`^\\s*def\\s+${escapeRegExp(functionName)}\\s*\\(`, "m").test(String(source ?? ""));
}

function functionSolutionLooksIncompleteForSemantic(source: string, functionName: string): boolean {
    const escaped = escapeRegExp(functionName);
    const pattern = new RegExp(`def\\s+${escaped}\\s*\\([^)]*\\):[\\s\\S]*?(?=\\n(?:def|class)\\s+|(?![\\s\\S]))`, "m");
    const match = String(source ?? "").match(pattern);
    if (!match) return false;
    return /\bpass\b|\.\.\.|#\s*(return|format|TODO|write|implement)/i.test(match[0]);
}

function pythonParamNamesForFunctionCheck(check: SemanticCheck): string[] {
    const args = semanticCheckArray(check, "args");
    if (args.length < 1) return [];
    return args.map((_, index) => (index === 0 ? "value" : `value_${index + 1}`));
}

function buildPythonReturnExpressionForFunctionCheck(check: SemanticCheck): string {
    const expected = normalizeSemanticExpectedValue(semanticCheckRecord(check).expected);
    const args = semanticCheckArray(check, "args");
    const params = pythonParamNamesForFunctionCheck(check);

    if (typeof expected === "string" && params.length > 0) {
        const firstArg = args[0];
        const firstParam = params[0] ?? "value";
        if (typeof firstArg === "number" && expected.includes(`$${firstArg.toFixed(2)}`)) {
            return 'f"$' + `{${firstParam}:.2f}"`;
        }
        if (typeof firstArg === "number" && expected.includes(`$${firstArg}`)) {
            return 'f"$' + `{${firstParam}}"`;
        }
        if (typeof firstArg === "string" && expected.includes(firstArg)) {
            const template = expected.split(firstArg).join(`{${firstParam}}`);
            return `f${pythonLiteralForValue(template)}`;
        }
    }

    return pythonLiteralForValue(expected);
}

function synthesizeSemanticFunctionImplementation(check: SemanticCheck): string | null {
    if (semanticCheckType(check) !== "function_returns") return null;
    const functionName = semanticCheckString(check, "functionName");
    if (!functionName) return null;
    const params = pythonParamNamesForFunctionCheck(check);
    const returnExpression = buildPythonReturnExpressionForFunctionCheck(check);
    return [`def ${functionName}(${params.join(", ")}):`, `    return ${returnExpression}`].join("\n");
}

function functionCheckNeedsDynamicImplementation(checks: SemanticCheck[]): boolean {
    const check = checks[0];
    if (!check || semanticCheckType(check) !== "function_returns") return false;
    const functionName = semanticCheckString(check, "functionName").toLowerCase();
    return /deposit|withdraw|summary|report|format|validate|record|transaction|money/.test(functionName);
}

function buildSemanticFunctionImplementation(args: {
    functionName: string;
    checks: SemanticCheck[];
    source: string;
}): string | null {
    const firstCheck = args.checks[0];
    if (!firstCheck || semanticCheckType(firstCheck) !== "function_returns") return null;

    const params = inferFunctionParamNames({
        functionName: args.functionName,
        checks: args.checks,
        source: args.source,
    });
    const firstArgs = semanticCheckArray(firstCheck, "args");
    const argKinds = semanticCheckArray(firstCheck, "argKinds").map((kind) => String(kind ?? ""));
    const expecteds = args.checks.map((check) => normalizeSemanticExpectedValue(semanticCheckRecord(check).expected));
    const normalized = args.functionName.toLowerCase();

    if (
        params.length >= 2 &&
        argKinds[0] === "dict_entries" &&
        /deposit/.test(normalized)
    ) {
        const accountParam = params[0] ?? "account";
        const amountParam = params[1] ?? "amount";
        return [
            `def ${args.functionName}(${params.join(", ")}):`,
            `    updated_balance = ${accountParam}.deposit(${amountParam})`,
            `    return f"{${accountParam}.owner} balance: {updated_balance}"`,
        ].join("\n");
    }

    if (
        params.length >= 2 &&
        argKinds[0] === "dict_entries" &&
        /withdraw/.test(normalized)
    ) {
        const accountParam = params[0] ?? "account";
        const amountParam = params[1] ?? "amount";
        return [
            `def ${args.functionName}(${params.join(", ")}):`,
            `    result = ${accountParam}.withdraw(${amountParam})`,
            `    return f"{${accountParam}.owner} balance: {result}"`,
        ].join("\n");
    }

    if (
        params.length === 1 &&
        typeof firstArgs[0] === "number" &&
        typeof expecteds[0] === "string" &&
        /^\$\d+\.\d{2}$/.test(String(expecteds[0]))
    ) {
        const amountParam = params[0] ?? "amount";
        return [
            `def ${args.functionName}(${params.join(", ")}):`,
            "    return f\"$" + `{${amountParam}:.2f}` + "\"",
        ].join("\n");
    }

    if (
        params.length >= 2 &&
        typeof expecteds[0] === "boolean" &&
        /can_(cover|afford)|cover|afford|enough/.test(normalized) &&
        (argKinds[0] === "dict_entries" || Array.isArray(firstArgs[0]))
    ) {
        const accountParam = params[0] ?? "account";
        const costParam = params[1] ?? "cost";
        return [
            `def ${args.functionName}(${params.join(", ")}):`,
            `    balance = ${accountParam}.get("balance") if isinstance(${accountParam}, dict) else (${accountParam}[1] if isinstance(${accountParam}, (list, tuple)) and len(${accountParam}) > 1 else ${accountParam}.balance)`,
            `    return ${costParam} <= balance`,
        ].join("\n");
    }

    if (
        params.length >= 1 &&
        typeof expecteds[0] === "boolean" &&
        /^(is_|can_|has_|validate)/.test(normalized)
    ) {
        const valueParam = params[0] ?? "value";
        return [
            `def ${args.functionName}(${params.join(", ")}):`,
            `    return ${valueParam} > 0`,
        ].join("\n");
    }

    if (
        params.length === 2 &&
        typeof firstArgs[0] === "string" &&
        typeof firstArgs[1] === "number" &&
        typeof expecteds[0] === "string"
    ) {
        const [labelParam, amountParam] = params;
        return [
            `def ${args.functionName}(${params.join(", ")}):`,
            `    return f"{${labelParam}}: {${amountParam}}"`,
        ].join("\n");
    }

    if (
        params.length === 1 &&
        argKinds[0] === "dict_entries" &&
        typeof expecteds[0] === "string"
    ) {
        const valueParam = params[0] ?? "value";
        const accountLike =
            /account|owner|balance|amount|total/.test(normalized) ||
            args.checks.some((check) => {
                const firstArg = semanticCheckArray(check, "args")[0];
                return (
                    Array.isArray(firstArg) &&
                    firstArg.some(
                        (entry) =>
                            Array.isArray(entry) &&
                            entry.length === 2 &&
                            typeof entry[0] === "string" &&
                            /owner|balance|amount|total/i.test(entry[0]),
                    )
                );
            });
        if (accountLike) {
            return [
                `def ${args.functionName}(${params.join(", ")}):`,
                `    owner = ${valueParam}["owner"] if isinstance(${valueParam}, dict) else ${valueParam}.owner`,
                `    balance = ${valueParam}["balance"] if isinstance(${valueParam}, dict) else ${valueParam}.balance`,
                '    return f"{owner} -> ${balance}"',
            ].join("\n");
        }
    }

    return synthesizeSemanticFunctionImplementation(firstCheck);
}

function completeSemanticFunctionSolutionFiles(exercise: PythonCodeInputExercise): {
    exercise: PythonCodeInputExercise;
    changed: boolean;
} {
    if (!isSemanticCodeExercise(exercise)) return { exercise, changed: false };
    if (!Array.isArray(exercise.solutionFiles) || exercise.solutionFiles.length < 1) {
        return { exercise, changed: false };
    }

    const checks = Array.isArray(exercise.semanticChecks) ? exercise.semanticChecks : [];
    const functionChecks = checks.filter((check) => semanticCheckType(check) === "function_returns");
    if (functionChecks.length < 1) return { exercise, changed: false };
    const source = collectPythonExerciseSource(exercise);

    let changed = false;
    const nextSolutionFiles = exercise.solutionFiles.map((file) => {
        const path = String((file as { path?: unknown }).path ?? "");
        const content = String((file as { content?: unknown }).content ?? "");
        if (!path.endsWith(".py")) return file;

        let nextContent = content;
        const functionNames = uniqueOrderedStrings(
            functionChecks.map((check) => semanticCheckString(check, "functionName")),
        );
        for (const functionName of functionNames) {
            if (!functionName || !functionDefinedInSource(nextContent, functionName)) continue;
            const groupedChecks = functionChecks.filter(
                (check) => semanticCheckString(check, "functionName") === functionName,
            );
            if (
                !functionSolutionLooksIncompleteForSemantic(nextContent, functionName) &&
                !functionCheckNeedsDynamicImplementation(groupedChecks)
            ) {
                continue;
            }
            const implementation = buildSemanticFunctionImplementation({
                functionName,
                checks: groupedChecks,
                source,
            });
            if (!implementation) continue;
            const escapedFunctionName = escapeRegExp(functionName);
            const pattern = new RegExp(`def\\s+${escapedFunctionName}\\s*\\([^)]*\\):[\\s\\S]*?(?=\\n(?:def|class)\\s+|(?![\\s\\S]))`, "m");
            const replaced = nextContent.replace(pattern, implementation);
            if (replaced !== nextContent) {
                nextContent = replaced;
                changed = true;
            }
        }

        return nextContent === content ? file : { ...file, content: nextContent };
    });

    if (!changed) return { exercise, changed: false };

    return {
        exercise: {
            ...exercise,
            solutionFiles: nextSolutionFiles,
        },
        changed: true,
    };
}

function syncSemanticWorkspaceEntrySurface(exercise: PythonCodeInputExercise): {
    exercise: PythonCodeInputExercise;
    changed: boolean;
} {
    if (!Array.isArray(exercise.solutionFiles) || exercise.solutionFiles.length < 1) {
        return { exercise, changed: false };
    }

    const entryFilePath = String(
        (exercise as { entryFilePath?: unknown }).entryFilePath ??
        exercise.solutionFiles.find((file) => (file as { isEntry?: unknown }).isEntry === true)?.path ??
        "main.py",
    );
    const entrySolution = exercise.solutionFiles.find((file) => String((file as { path?: unknown }).path ?? "") === entryFilePath);
    const entryStarter = Array.isArray(exercise.starterFiles)
        ? exercise.starterFiles.find((file) => String((file as { path?: unknown }).path ?? "") === entryFilePath)
        : null;

    const nextSolutionCode = String((entrySolution as { content?: unknown } | undefined)?.content ?? exercise.solutionCode ?? "");
    const nextStarterCode = String((entryStarter as { content?: unknown } | null)?.content ?? exercise.starterCode ?? "");

    if (
        nextSolutionCode === String(exercise.solutionCode ?? "") &&
        nextStarterCode === String(exercise.starterCode ?? "")
    ) {
        return { exercise, changed: false };
    }

    return {
        exercise: {
            ...exercise,
            solutionCode: nextSolutionCode,
            starterCode: nextStarterCode,
        },
        changed: true,
    };
}

function cleanPipeDelimitedFixtureContent(content: string): string {
    const normalized = String(content ?? "").replace(/\r\n?/g, "\n");
    const lines = normalized.split("\n");

    const nonEmpty = lines
        .map((line) => line.trim())
        .filter(Boolean);

    const pipeLines = nonEmpty.filter((line) => line.includes("|"));

    if (pipeLines.length < 2) {
        return normalized.trimEnd();
    }

    const expectedPipeCount = (pipeLines[0]?.match(/\|/g) ?? []).length;

    if (expectedPipeCount < 1) {
        return normalized.trimEnd();
    }

    const cleanedLines = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;

        const pipeCount = (trimmed.match(/\|/g) ?? []).length;
        return pipeCount === expectedPipeCount;
    });

    if (cleanedLines.length < 1) {
        return normalized.trimEnd();
    }

    return cleanedLines.join("\n");
}

function cleanPipeDelimitedFixtureGarbage(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise {
    const files = normalizeDraftFixtureFiles(exercise.files);

    if (files.length < 1) return exercise;

    let changed = false;

    const cleanedFiles = files.map((file) => {
        const cleanedContent = cleanPipeDelimitedFixtureContent(file.content);

        if (cleanedContent !== file.content) {
            changed = true;
        }

        return {
            ...file,
            content: cleanedContent,
        };
    });

    return changed
        ? {
            ...exercise,
            files: cleanedFiles,
        }
        : exercise;
}

async function convertSemanticRunnableProjectToFixedTests(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (!isSemanticCodeExercise(exercise)) return null;
    if (!looksLikeRunnableProjectProgram(exercise)) return null;

    // OOP/multifile exercises often include a small top-level demo print in
    // main.py, but their real contract is structural: classes, constructors,
    // attributes, imports, and method behavior. Converting those semantic
    // checks into one stdout fixed_test makes the critique gate fail and loses
    // the exact class-level checks the learner needs.
    if (looksLikeOopSemanticStructureExercise(exercise)) return null;

    const cleanedExercise = cleanPipeDelimitedFixtureGarbage(exercise);
    const solutionCode = String(cleanedExercise.solutionCode ?? "").trim();

    if (!solutionCode) return null;

    const files = normalizeDraftFixtureFiles(cleanedExercise.files);
    const runner = getCodeRunner() ?? runLocalCode;

    const run = await runner({
        language: "python",
        code: solutionCode,
        stdin: "",
        files: files.length > 0 ? files : undefined,
        limits: { timeoutMs: 4000 },
    });

    if (!run.ok) return null;

    const stdout = String(run.stdout ?? "");

    if (!stdout.trim()) return null;

    const {
        semanticChecks: _removedSemanticChecks,
        tests: _removedTests,
        ...rest
    } = cleanedExercise;

    return {
        ...rest,
        recipeType: "fixed_tests",
        tests: [
            {
                stdin: "",
                stdout,
                match: "exact",
                ...(files.length > 0 ? { files } : {}),
            },
        ],
    };
}
function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object";
}

type MethodSequenceSemanticCheck = Extract<
    SemanticCheck,
    { type: "method_sequence_returns" }
>;

type MethodCallForSequence = NonNullable<MethodSequenceSemanticCheck["calls"]>[number];

type PythonMethodSignature = {
    name: string;
    paramCount: number;
};

function extractPythonClassBody(source: string, className: string): string {
    const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
    const safeClassName = /^[A-Za-z_]\w*$/.test(className)
        ? className
        : className.replace(/[^A-Za-z0-9_]/g, "");
    if (!safeClassName) return "";

    const classPattern = new RegExp(`^class\\s+${safeClassName}\\b`);
    const startIndex = lines.findIndex((line) => classPattern.test(line.trimStart()));
    if (startIndex < 0) return "";

    const body: string[] = [];
    for (let index = startIndex + 1; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (/^\S/.test(line) && line.trim()) break;
        body.push(line);
    }

    return body.join("\n");
}

function extractPythonMethodSignatures(source: string, className: string): PythonMethodSignature[] {
    const body = extractPythonClassBody(source, className);
    if (!body) return [];

    const methods: PythonMethodSignature[] = [];
    const pattern = /^\s+def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/gm;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(body))) {
        const name = match[1] ?? "";
        const rawParams = String(match[2] ?? "")
            .split(",")
            .map((param) => param.trim())
            .filter(Boolean);
        const paramCount = rawParams.filter((param) => param !== "self").length;

        if (name) methods.push({ name, paramCount });
    }

    return methods;
}

function firstNumericValue(values: unknown[]): number | null {
    for (const value of values) {
        if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return null;
}

function buildStateChangingMethodCalls(args: {
    source: string;
    className: string;
    getterName: string;
    constructorArgs: unknown[];
    expected: unknown;
}): MethodCallForSequence[] {
    const methods = extractPythonMethodSignatures(args.source, args.className)
        .filter((method) => method.name !== "__init__" && method.name !== args.getterName);
    const expected = args.expected;
    const getterSuffix = args.getterName.startsWith("get_")
        ? args.getterName.slice("get_".length)
        : "";

    const setter = methods.find((method) =>
        method.paramCount === 1 &&
        getterSuffix &&
        method.name === `set_${getterSuffix}`,
    );
    if (setter) {
        return [{ methodName: setter.name, methodArgs: [expected] }];
    }

    if (Array.isArray(expected) && expected.length > 0) {
        const addMethod = methods.find((method) =>
            method.paramCount === 1 && /^(add|append|record)_?/.test(method.name),
        );
        if (addMethod) {
            return [{ methodName: addMethod.name, methodArgs: [expected[0]] }];
        }
    }

    if (typeof expected === "number" && Number.isFinite(expected)) {
        const baseline = firstNumericValue(args.constructorArgs) ?? 0;
        const delta = expected - baseline;
        const oneArgMutator = methods.find((method) =>
            method.paramCount === 1 &&
            /^(deposit|add|credit|increase|increment|record|set)_?/.test(method.name),
        );

        if (oneArgMutator) {
            const amount = oneArgMutator.name.startsWith("set_")
                ? expected
                : delta !== 0
                    ? delta
                    : expected;
            return [{ methodName: oneArgMutator.name, methodArgs: [amount] }];
        }

        const zeroArgIncrement = methods.find((method) =>
            method.paramCount === 0 && /^(increment|increase|add)_?/.test(method.name),
        );
        if (zeroArgIncrement && expected > baseline && expected - baseline <= 5) {
            return Array.from({ length: expected - baseline }, () => ({
                methodName: zeroArgIncrement.name,
                methodArgs: [],
            }));
        }

        const zeroArgDecrement = methods.find((method) =>
            method.paramCount === 0 && /^(decrement|decrease)_?/.test(method.name),
        );
        if (zeroArgDecrement && expected < baseline && baseline - expected <= 5) {
            return Array.from({ length: baseline - expected }, () => ({
                methodName: zeroArgDecrement.name,
                methodArgs: [],
            }));
        }
    }

    if (typeof expected === "string") {
        const textMutator = methods.find((method) =>
            method.paramCount === 1 && /^(set|rename|update|change|add|record)_?/.test(method.name),
        );
        if (textMutator) {
            return [{ methodName: textMutator.name, methodArgs: [expected] }];
        }
    }

    return [];
}


function extractPythonClassNames(source: string): string[] {
    const names: string[] = [];
    const pattern = /^class\s+([A-Z][A-Za-z_]\w*)\b/gm;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(String(source ?? "")))) {
        const name = match[1] ?? "";
        if (name && !names.includes(name)) names.push(name);
    }

    return names;
}

function extractPythonConstructorParamNames(source: string, className: string): string[] {
    const body = extractPythonClassBody(source, className);
    if (!body) return [];

    const match = body.match(/^\s+def\s+__init__\s*\(([^)]*)\)\s*:/m);
    if (!match) return [];

    return String(match[1] ?? "")
        .split(",")
        .map((param) => param.trim())
        .filter((param) => param && param !== "self")
        .map((param) => param.replace(/\s*=.*$/, "").replace(/:.*/, "").trim())
        .filter(Boolean);
}

function inferSinglePythonClassName(source: string): string {
    const names = extractPythonClassNames(source);
    return names.length === 1 ? names[0] ?? "" : "";
}

function findGetterForStatefulMethod(args: {
    source: string;
    className: string;
    methodName: string;
    expected: unknown;
}): string {
    const methodName = args.methodName;
    const methods = extractPythonMethodSignatures(args.source, args.className);

    const hasMethod = (name: string) =>
        methods.some((method) => method.name === name && method.paramCount === 0);

    if (/^(deposit|withdraw|credit|debit|increase|decrease|increment|decrement|add|remove)_?/.test(methodName)) {
        if (hasMethod("get_balance")) return "get_balance";
        if (hasMethod("balance")) return "balance";
    }

    if (/^(set|rename|update|change)_?/.test(methodName)) {
        const suffix = methodName.replace(/^(set|rename|update|change)_?/, "");
        if (suffix && hasMethod(`get_${suffix}`)) return `get_${suffix}`;
    }

    const zeroArgGetters = methods
        .filter((method) => method.paramCount === 0 && /^get_/.test(method.name))
        .map((method) => method.name);

    if (typeof args.expected === "number") {
        const numericPreferred = zeroArgGetters.find((name) =>
            /\b(balance|count|total|amount|score|quantity|level|value)\b/.test(name),
        );
        if (numericPreferred) return numericPreferred;
    }

    return zeroArgGetters[0] ?? "";
}

function findAttributeForStatefulMethod(args: {
    source: string;
    className: string;
    methodName: string;
    expected: unknown;
}): string {
    const constructorParams = extractPythonConstructorParamNames(args.source, args.className);

    if (/^(deposit|withdraw|credit|debit|increase|decrease)_?/.test(args.methodName)) {
        const balanceParam = constructorParams.find((param) =>
            /^(balance|amount|total|funds|cash)$/i.test(param),
        );
        if (balanceParam) return balanceParam;
    }

    if (/^(increment|decrement|add|remove)_?/.test(args.methodName)) {
        const countParam = constructorParams.find((param) =>
            /^(count|total|quantity|score|points|level|value)$/i.test(param),
        );
        if (countParam) return countParam;
    }

    if (/^(set|rename|update|change)_?/.test(args.methodName)) {
        const suffix = args.methodName.replace(/^(set|rename|update|change)_?/, "");
        const matchingParam = constructorParams.find((param) => param === suffix);
        if (matchingParam) return matchingParam;
    }

    if (typeof args.expected === "number") {
        const numericParam = constructorParams.find((param) =>
            /\b(balance|count|total|amount|score|quantity|level|value)\b/i.test(param),
        );
        if (numericParam) return numericParam;
    }

    return "";
}

function maybeRepairFunctionObjectArgumentCheck(args: {
    check: Record<string, unknown>;
    source: string;
}): SemanticCheck | null {
    if (args.check.type !== "function_returns") return null;

    const rawArgs = Array.isArray(args.check.args) ? args.check.args : [];
    const rawKinds = Array.isArray(args.check.argKinds) ? args.check.argKinds : [];
    if (rawArgs.length < 1) return null;

    const firstKind = typeof rawKinds[0] === "string" ? rawKinds[0].trim() : "";
    if (firstKind && firstKind !== "value") return null;

    const firstArg = rawArgs[0];
    if (!Array.isArray(firstArg) || firstArg.length < 1) return null;
    if (firstArg.some((item) => Array.isArray(item) && item.length === 2)) return null;

    const className = inferSinglePythonClassName(args.source);
    if (!className) return null;

    const constructorParams = extractPythonConstructorParamNames(args.source, className);
    if (constructorParams.length !== firstArg.length) return null;

    const nextArgKinds = rawArgs.map((_, index) => {
        if (index === 0) return "dict_entries";
        const kind = typeof rawKinds[index] === "string" ? rawKinds[index].trim() : "";
        return kind || "value";
    });

    return {
        ...(args.check as SemanticCheck),
        args: [
            constructorParams.map((param, index) => [param, firstArg[index]]),
            ...rawArgs.slice(1),
        ],
        argKinds: nextArgKinds,
        message:
            typeof args.check.message === "string" && args.check.message.trim()
                ? args.check.message
                : `Call the function with a ${className} object built from the expected fields.`,
    } as SemanticCheck;
}


function repairStatefulSemanticMethodReturns(
    exercise: PythonCodeInputExercise,
): { exercise: PythonCodeInputExercise; changed: boolean } {
    if (!isSemanticCodeExercise(exercise)) return { exercise, changed: false };
    if (!looksLikeOopSemanticStructureExercise(exercise)) return { exercise, changed: false };

    const semanticChecks = Array.isArray(exercise.semanticChecks)
        ? exercise.semanticChecks
        : [];
    if (semanticChecks.length < 1) return { exercise, changed: false };

    const source = collectPythonExerciseSource(exercise);
    let changed = false;

    const nextChecks = semanticChecks.map((check): SemanticCheck => {
        if (!isRecord(check)) return check as SemanticCheck;

        const repairedFunctionCheck = maybeRepairFunctionObjectArgumentCheck({
            check,
            source,
        });
        if (repairedFunctionCheck) {
            changed = true;
            return repairedFunctionCheck;
        }

        if (check.type !== "method_returns") {
            return check as SemanticCheck;
        }

        const className = normalizeText(check.className);
        const methodName = normalizeText(check.methodName);
        const constructorArgs = Array.isArray(check.constructorArgs)
            ? check.constructorArgs
            : [];

        if (!className || !methodName || !("expected" in check)) {
            return check as SemanticCheck;
        }

        // Plain method_returns should be used for pure methods. Getter-style
        // checks with an expected changed value usually need a prior mutating
        // method call, e.g. deposit(50) before get_balance() returns 150.
        if (methodName.startsWith("get_") || /^summary$|^status$|^label$/.test(methodName)) {
            const calls = buildStateChangingMethodCalls({
                source,
                className,
                getterName: methodName,
                constructorArgs,
                expected: check.expected,
            });

            if (calls.length < 1) return check as SemanticCheck;

            changed = true;
            return {
                ...check,
                type: "method_sequence_returns",
                calls,
                message:
                    typeof check.message === "string" && check.message.trim()
                        ? check.message
                        : `${className}.${methodName}() should return the expected value after the required method calls.`,
            } as SemanticCheck;
        }

        // Models often generate checks like:
        //   Account.deposit(50) should return 150
        // but deposit mutates state and returns None. Convert those checks into
        // a state check after the mutating method call.
        //
        // Keep boolean/None expectations on the mutator itself, because methods
        // such as withdraw() often intentionally return True/False.
        const methodArgs = Array.isArray(check.methodArgs) ? check.methodArgs : [];
        const expected = check.expected;
        const looksLikeStatefulMutator =
            methodArgs.length > 0 &&
            typeof expected === "number" &&
            /^(deposit|withdraw|credit|debit|increase|decrease|increment|decrement|add|remove|set|rename|update|change)_?/.test(methodName);

        if (!looksLikeStatefulMutator) return check as SemanticCheck;

        const getterName = findGetterForStatefulMethod({
            source,
            className,
            methodName,
            expected,
        });

        if (getterName) {
            changed = true;
            return {
                ...check,
                type: "method_sequence_returns",
                calls: [
                    {
                        methodName,
                        methodArgs,
                        ...(Array.isArray(check.methodArgKinds)
                            ? { methodArgKinds: check.methodArgKinds }
                            : {}),
                    },
                ],
                methodName: getterName,
                methodArgs: [],
                methodArgKinds: [],
                message:
                    typeof check.message === "string" && check.message.trim()
                        ? check.message
                        : `${className}.${getterName}() should return the expected value after ${methodName}() updates the object.`,
            } as SemanticCheck;
        }

        const attributeName = findAttributeForStatefulMethod({
            source,
            className,
            methodName,
            expected,
        });

        if (!attributeName) return check as SemanticCheck;

        changed = true;
        return {
            type: "attribute_sequence_equals",
            className,
            constructorArgs,
            ...(Array.isArray(check.constructorArgKinds)
                ? { constructorArgKinds: check.constructorArgKinds }
                : {}),
            calls: [
                {
                    methodName,
                    methodArgs,
                    ...(Array.isArray(check.methodArgKinds)
                        ? { methodArgKinds: check.methodArgKinds }
                        : {}),
                },
            ],
            attributeName,
            expected,
            ...(typeof check.expectedKind === "string" ? { expectedKind: check.expectedKind } : {}),
            message:
                typeof check.message === "string" && check.message.trim()
                    ? check.message
                    : `${className}.${attributeName} should equal the expected value after ${methodName}() updates the object.`,
        } as SemanticCheck;
    });

    if (!changed) return { exercise, changed: false };

    return {
        exercise: {
            ...exercise,
            recipeType: "semantic",
            semanticChecks: nextChecks,
        },
        changed: true,
    };
}

function ensureTryItYourselfSketch(draft: TopicAuthoringDraft): TopicAuthoringDraft {
    if (hasTryItYourselfSketch(draft)) return draft;

    return {
        ...draft,
        sketchBlocks: [
            ...draft.sketchBlocks,
            {
                id: "try-it-yourself",
                title: "Try it yourself",
                bodyMarkdown:
                    "Try it yourself: change one value in the example, predict the new output, then run the code to check your prediction.",
            },
        ],
    };
}
const PYTHON_TEXT_REPAIRS: Array<{
    from: RegExp;
    to: string;
    fieldLabel: string;
}> = [
    {
        from: /^Focus on the SQL task being asked for, not on copying final query text\.$/i,
        to: "Focus on the programming task being asked for, not on copying the final answer text.",
        fieldLabel: "hint",
    },
    {
        from: /^Build the query from the operation the exercise is testing\.$/i,
        to: "Build the program from the behavior the exercise is testing.",
        fieldLabel: "help.concept",
    },
    {
        from: /^Think about which clauses or functions are required for the task\.$/i,
        to: "Think about which Python statements, functions, or commands are required for the task.",
        fieldLabel: "help.hint_1",
    },
    {
        from: /^Construct the query based on what result the exercise expects, not by repeating exact solution wording\.$/i,
        to: "Construct the code based on the behavior the exercise expects, not by repeating exact solution wording.",
        fieldLabel: "help.hint_2",
    },
];

function hasMultilineCodeFence(text: string): boolean {
    const matches = Array.from(text.matchAll(/```(?:\w+)?\n([\s\S]*?)```/g));
    return matches.some((match) => {
        const block = match[1] ?? "";
        const lines = block
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        return lines.length >= 2;
    });
}

function hasLineByLineExplanation(text: string): boolean {
    return (
        /\bline by line\b/i.test(text) ||
        /\beach line\b/i.test(text) ||
        /\bthis line\b/i.test(text) ||
        /\bfirst line\b/i.test(text) ||
        /\bsecond line\b/i.test(text) ||
        /\bstep by step\b/i.test(text)
    );
}

function rewritePythonLeakText(value: string): {
    next: string;
    changed: boolean;
    fieldLabel?: string;
} {
    for (const repair of PYTHON_TEXT_REPAIRS) {
        if (!repair.from.test(value)) continue;
        return {
            next: repair.to,
            changed: true,
            fieldLabel: repair.fieldLabel,
        };
    }

    return {
        next: value,
        changed: false,
    };
}

type PythonDraftExercise = TopicAuthoringDraft["quizDraft"][number];
type PythonCodeInputExercise = Extract<PythonDraftExercise, { kind: "code_input" }>;
type PythonChoiceExercise = Extract<
    PythonDraftExercise,
    { kind: "single_choice" | "multi_choice" }
>;
type PythonFillBlankExercise = Extract<PythonDraftExercise, { kind: "fill_blank_choice" }>;

type ThinFixedTestRepairResult =
    | {
        status: "repaired";
        exercise: PythonCodeInputExercise;
        addedCount: number;
    }
    | {
        status: "unsafe";
        reason: string;
    }
    | {
        status: "unchanged";
    };

type FileFixtureRepairResult =
    | {
        changed: false;
      }
    | {
        changed: true;
        exercise: PythonCodeInputExercise;
        addedExerciseFixture: boolean;
        addedTestFixtures: number;
        alignedTests: boolean;
      };

type DraftFixtureFile = {
    path: string;
    content: string;
    readOnly?: boolean;
};

type FixtureSanitizationResult = {
    files: DraftFixtureFile[];
    changed: boolean;
    removedInvalidPaths: number;
    removedUnreferencedPaths: number;
    normalizedContents: number;
    dedupedPaths: number;
};

const PYTHON_WORKSPACE_DISTRACTORS = [
    "Lesson notes panel",
    "Color theme picker",
    "Progress tracker",
    "Keyboard shortcut guide",
];
const PYTHON_MAX_FIXTURE_CONTENT_LENGTH = 600;

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeComparableText(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[`"'.,;:!?()[\]{}]/g, "")
        .replace(/\s+/g, " ");
}

function canonicalOptionIds(count: number): string[] {
    return Array.from({ length: count }, (_, index) => String.fromCharCode(97 + index));
}

function isForbiddenWorkspaceChoice(value: string): boolean {
    const normalized = normalizeComparableText(value);
    return (
        normalized === "terminal" ||
        normalized === "the terminal" ||
        normalized === "command line" ||
        normalized === "shell" ||
        normalized === "console"
    );
}

function isAllowedPythonWorkspaceChoice(value: string): boolean {
    const normalized = normalizeComparableText(value);
    return (
        normalized === "code editor" ||
        normalized === "run" ||
        normalized === "run button" ||
        normalized === "output panel"
    );
}

function pickSafeWorkspaceDistractor(existing: string[]): string {
    const used = new Set(existing.map((value) => normalizeComparableText(value)));

    for (const candidate of PYTHON_WORKSPACE_DISTRACTORS) {
        const normalized = normalizeComparableText(candidate);
        if (used.has(normalized)) continue;
        if (isForbiddenWorkspaceChoice(candidate)) continue;
        return candidate;
    }

    return "Lesson checklist";
}

function replacePythonForbiddenWorkspaceTerms(value: string): {
    next: string;
    changed: boolean;
} {
    let next = String(value ?? "");
    const replacements: Array<[RegExp, string]> = [
        [/\bconsole or output area\b/gi, "output panel"],
        [/\bterminal output\b/gi, "output panel"],
        [/\bconsole output\b/gi, "output panel"],
        [/\boutput area\b/gi, "output panel"],
        [/\bterminal commands?\b/gi, "code editor"],
        [/\bshell commands?\b/gi, "code editor"],
        [/\bcommand line\b/gi, "code editor"],
        [/\bshell\b/gi, "code editor"],
        [/\bconsole\b/gi, "output panel"],
        [/\bterminal\b/gi, "code editor"],
    ];

    for (const [pattern, replacement] of replacements) {
        next = next.replace(pattern, replacement);
    }

    return {
        next,
        changed: next !== value,
    };
}

function repairPythonWorkspaceTextField(args: {
    value: string;
    field: string;
    report: RepairReport;
}) {
    const repair = replacePythonForbiddenWorkspaceTerms(args.value);

    if (repair.changed) {
        args.report.repairs.push({
            code: "PYTHON_FORBIDDEN_WORKSPACE_TERM_REPLACED",
            category: "text",
            severity: "medium",
            field: args.field,
            message:
                "Replaced forbidden Python browser-workspace wording with allowed learner-facing workspace language.",
        });
    }

    return repair.next;
}

function repairPythonChoiceExerciseWorkspaceTerms(args: {
    exercise: PythonChoiceExercise;
    report: RepairReport;
}): PythonChoiceExercise {
    const options = [...(args.exercise.options ?? [])];
    const optionIds = canonicalOptionIds(options.length);
    const correctSet = new Set(
        Array.isArray(args.exercise.correctOptionIds) ? args.exercise.correctOptionIds : [],
    );
    let removedForbiddenCorrect = false;
    let changed = false;

    for (let index = 0; index < options.length; index += 1) {
        const option = String(options[index] ?? "");
        if (!isForbiddenWorkspaceChoice(option)) {
            const textRepair = replacePythonForbiddenWorkspaceTerms(option);
            if (textRepair.changed) {
                options[index] = textRepair.next;
                changed = true;
                args.report.repairs.push({
                    code: "PYTHON_FORBIDDEN_WORKSPACE_TERM_REPLACED",
                    category: "text",
                    severity: "medium",
                    field: `${args.exercise.id}.options.${index}`,
                    message:
                        "Replaced forbidden Python browser-workspace wording inside a learner-facing option.",
                });
            }
            continue;
        }

        if (correctSet.has(optionIds[index]!)) {
            correctSet.delete(optionIds[index]!);
            removedForbiddenCorrect = true;
        }

        options[index] = pickSafeWorkspaceDistractor(options);
        changed = true;

        args.report.repairs.push({
            code: "PYTHON_FORBIDDEN_WORKSPACE_OPTION_REPLACED",
            category: "text",
            severity: "medium",
            field: `${args.exercise.id}.options.${index}`,
            message:
                "Replaced a forbidden Python browser-workspace distractor with a safe non-workspace option.",
        });
    }

    const seenOptions = new Set<string>();
    for (let index = 0; index < options.length; index += 1) {
        const normalized = normalizeComparableText(String(options[index] ?? ""));
        if (!normalized || !seenOptions.has(normalized)) {
            seenOptions.add(normalized);
            continue;
        }

        options[index] = pickSafeWorkspaceDistractor(options);
        changed = true;
        args.report.repairs.push({
            code: "PYTHON_FORBIDDEN_WORKSPACE_OPTION_REPLACED",
            category: "text",
            severity: "medium",
            field: `${args.exercise.id}.options.${index}`,
            message:
                "Replaced a duplicate learner-facing option created during Python workspace-term repair.",
        });
    }

    let correctOptionIds = optionIds.filter((id) => correctSet.has(id));
    if (removedForbiddenCorrect) {
        const allowedWorkspaceIds = optionIds.filter((id, index) =>
            isAllowedPythonWorkspaceChoice(options[index] ?? ""),
        );

        if (args.exercise.kind === "single_choice") {
            if (correctOptionIds.length < 1) {
                correctOptionIds =
                    allowedWorkspaceIds.length > 0
                        ? [allowedWorkspaceIds[0]!]
                        : optionIds.length > 0
                            ? [optionIds[0]!]
                            : [];
            } else {
                correctOptionIds = [correctOptionIds[0]!];
            }
        } else if (correctOptionIds.length < 1 && allowedWorkspaceIds.length > 0) {
            correctOptionIds = allowedWorkspaceIds;
        }

        args.report.repairs.push({
            code: "PYTHON_FORBIDDEN_WORKSPACE_CORRECT_ANSWER_REPAIRED",
            category: "text",
            severity: "high",
            field: `${args.exercise.id}.correctOptionIds`,
            message:
                "Removed a forbidden Python browser-workspace option from the correct answers and restored allowed answer ids.",
        });
    }

    if (!changed && !removedForbiddenCorrect) {
        return args.exercise;
    }

    return {
        ...args.exercise,
        options,
        correctOptionIds,
    };
}

function repairPythonFillBlankWorkspaceTerms(args: {
    exercise: PythonFillBlankExercise;
    report: RepairReport;
}): PythonFillBlankExercise {
    const choices = [...(args.exercise.choices ?? [])];
    let correctValue = String(args.exercise.correctValue ?? "");
    let removedForbiddenCorrect = false;
    let changed = false;

    for (let index = 0; index < choices.length; index += 1) {
        const choice = String(choices[index] ?? "");
        if (!isForbiddenWorkspaceChoice(choice)) continue;

        if (normalizeComparableText(correctValue) === normalizeComparableText(choice)) {
            removedForbiddenCorrect = true;
        }

        choices[index] = pickSafeWorkspaceDistractor(choices);
        changed = true;

        args.report.repairs.push({
            code: "PYTHON_FORBIDDEN_WORKSPACE_OPTION_REPLACED",
            category: "text",
            severity: "medium",
            field: `${args.exercise.id}.choices.${index}`,
            message:
                "Replaced a forbidden Python browser-workspace choice with a safe non-workspace option.",
        });
    }

    const seenChoices = new Set<string>();
    for (let index = 0; index < choices.length; index += 1) {
        const normalized = normalizeComparableText(String(choices[index] ?? ""));
        if (!normalized || !seenChoices.has(normalized)) {
            seenChoices.add(normalized);
            continue;
        }

        choices[index] = pickSafeWorkspaceDistractor(choices);
        changed = true;
        args.report.repairs.push({
            code: "PYTHON_FORBIDDEN_WORKSPACE_OPTION_REPLACED",
            category: "text",
            severity: "medium",
            field: `${args.exercise.id}.choices.${index}`,
            message:
                "Replaced a duplicate learner-facing choice created during Python workspace-term repair.",
        });
    }

    if (removedForbiddenCorrect) {
        const allowedChoice = choices.find((choice) => isAllowedPythonWorkspaceChoice(choice));
        correctValue = allowedChoice ?? choices[0] ?? correctValue;
        args.report.repairs.push({
            code: "PYTHON_FORBIDDEN_WORKSPACE_CORRECT_ANSWER_REPAIRED",
            category: "text",
            severity: "high",
            field: `${args.exercise.id}.correctValue`,
            message:
                "Removed a forbidden Python browser-workspace choice from the correct answer and restored an allowed fill-blank value.",
        });
    }

    if (!changed && !removedForbiddenCorrect) {
        return args.exercise;
    }

    return {
        ...args.exercise,
        choices,
        correctValue,
    };
}

function repairPythonBrowserWorkspaceTerms(args: {
    draft: TopicAuthoringDraft;
    seed: TopicSeed;
    report: RepairReport;
}): TopicAuthoringDraft {
    if (args.seed.workspacePolicy?.workspace.capabilities?.terminal.enabled === true) {
        return args.draft;
    }

    return {
        ...args.draft,
        title: repairPythonWorkspaceTextField({
            value: String(args.draft.title ?? ""),
            field: "title",
            report: args.report,
        }),
        summary: repairPythonWorkspaceTextField({
            value: String(args.draft.summary ?? ""),
            field: "summary",
            report: args.report,
        }),
        sketchBlocks: args.draft.sketchBlocks.map((block) => ({
            ...block,
            title: repairPythonWorkspaceTextField({
                value: String(block.title ?? ""),
                field: `sketchBlocks.${block.id}.title`,
                report: args.report,
            }),
            bodyMarkdown: repairPythonWorkspaceTextField({
                value: String(block.bodyMarkdown ?? ""),
                field: `sketchBlocks.${block.id}.bodyMarkdown`,
                report: args.report,
            }),
        })),
        projectDraft: args.draft.projectDraft
            ? {
                ...args.draft.projectDraft,
                title: repairPythonWorkspaceTextField({
                    value: String(args.draft.projectDraft.title ?? ""),
                    field: "projectDraft.title",
                    report: args.report,
                }),
            }
            : args.draft.projectDraft,
        quizDraft: args.draft.quizDraft.map((exercise) => {
            const repairedBase = {
                ...exercise,
                title: repairPythonWorkspaceTextField({
                    value: String(exercise.title ?? ""),
                    field: `${exercise.id}.title`,
                    report: args.report,
                }),
                prompt: repairPythonWorkspaceTextField({
                    value: String(exercise.prompt ?? ""),
                    field: `${exercise.id}.prompt`,
                    report: args.report,
                }),
                hint: repairPythonWorkspaceTextField({
                    value: String(exercise.hint ?? ""),
                    field: `${exercise.id}.hint`,
                    report: args.report,
                }),
                help: {
                    ...exercise.help,
                    concept: repairPythonWorkspaceTextField({
                        value: String(exercise.help?.concept ?? ""),
                        field: `${exercise.id}.help.concept`,
                        report: args.report,
                    }),
                    hint_1: repairPythonWorkspaceTextField({
                        value: String(exercise.help?.hint_1 ?? ""),
                        field: `${exercise.id}.help.hint_1`,
                        report: args.report,
                    }),
                    hint_2: repairPythonWorkspaceTextField({
                        value: String(exercise.help?.hint_2 ?? ""),
                        field: `${exercise.id}.help.hint_2`,
                        report: args.report,
                    }),
                },
            };

            if (repairedBase.kind === "single_choice" || repairedBase.kind === "multi_choice") {
                return repairPythonChoiceExerciseWorkspaceTerms({
                    exercise: repairedBase,
                    report: args.report,
                });
            }

            if (repairedBase.kind === "fill_blank_choice") {
                return repairPythonFillBlankWorkspaceTerms({
                    exercise: {
                        ...repairedBase,
                        choices: (repairedBase.choices ?? []).map((choice, index) =>
                            repairPythonWorkspaceTextField({
                                value: String(choice ?? ""),
                                field: `${repairedBase.id}.choices.${index}`,
                                report: args.report,
                            }),
                        ),
                    },
                    report: args.report,
                });
            }

            if (repairedBase.kind === "drag_reorder") {
                return {
                    ...repairedBase,
                    tokens: (repairedBase.tokens ?? []).map((token, index) =>
                        repairPythonWorkspaceTextField({
                            value: String(token ?? ""),
                            field: `${repairedBase.id}.tokens.${index}`,
                            report: args.report,
                        }),
                    ),
                    correctOrder: (repairedBase.correctOrder ?? []).map((token, index) =>
                        repairPythonWorkspaceTextField({
                            value: String(token ?? ""),
                            field: `${repairedBase.id}.correctOrder.${index}`,
                            report: args.report,
                        }),
                    ),
                };
            }

            return repairedBase;
        }),
    };
}

function countKinds(draft: TopicAuthoringDraft) {
    return draft.quizDraft.reduce(
        (counts, exercise) => {
            counts[exercise.kind] += 1;
            return counts;
        },
        {
            single_choice: 0,
            multi_choice: 0,
            drag_reorder: 0,
            fill_blank_choice: 0,
            code_input: 0,
        },
    );
}

function looksLikeConditionalTopic(seed: TopicSeed) {
    const haystack = `${seed.topicId} ${seed.title} ${seed.summary}`.toLowerCase();
    return /\bif\b|\belif\b|\belse\b|\bcondition/.test(haystack);
}

function looksLikeTruthinessTopic(seed: TopicSeed) {
    const haystack = `${seed.topicId} ${seed.title} ${seed.summary}`.toLowerCase();
    return /\btruth(y|iness)\b|\bfalsy\b|\bempty\b/.test(haystack);
}

function buildConditionalFillBlankExercise(id: string): PythonDraftExercise {
    return {
        id,
        kind: "fill_blank_choice",
        title: "Choose the missing conditional keyword",
        prompt: "Fill in the missing Python keyword to continue the conditional chain correctly.",
        template:
            "if score >= 90:\n    print('A')\n___ score >= 80:\n    print('B')\nelse:\n    print('C')",
        choices: ["elif", "for", "def", "while"],
        correctValue: "elif",
        hint: "Choose the Python keyword used for another condition after an if block.",
        help: {
            concept:
                "Python uses `elif` to check another condition after an earlier `if` condition.",
            hint_1:
                "The missing word should continue the same conditional chain.",
            hint_2:
                "It is the keyword that means 'else if' in Python.",
        },
    };
}

function buildGenericFillBlankExercise(id: string): PythonDraftExercise {
    return {
        id,
        kind: "fill_blank_choice",
        title: "Choose the missing Python keyword",
        prompt: "Fill in the missing Python keyword so the statement is valid.",
        template: "___ value > 0:\n    print('positive')",
        choices: ["if", "for", "def", "class"],
        correctValue: "if",
        hint: "Think about which keyword starts a condition in Python.",
        help: {
            concept:
                "An `if` statement starts a conditional check in Python.",
            hint_1: "This keyword asks Python to test whether a condition is true.",
            hint_2: "It appears before the condition and a colon.",
        },
    };
}

function buildTruthinessCodeInputExercise(
    id: string,
    index = 1,
): PythonDraftExercise {
    const prompts = [
        {
            title: "Check whether text is empty",
            prompt:
                "Read a line of text. Print `True` when the line is not empty and `False` when it is empty.",
            starterCode: "text = input()\n# Your code here\n",
            solutionCode:
                "text = input()\nif text:\n    print(True)\nelse:\n    print(False)\n",
            tests: [
                { stdin: "hello\n", stdout: "True\n", match: "exact" as const },
                { stdin: "\n", stdout: "False\n", match: "exact" as const },
            ],
            hint: "Use Python truthiness to decide whether the text is empty or non-empty.",
            help: {
                concept:
                    "In Python, an empty string is falsy and a non-empty string is truthy.",
                hint_1: "You can test the text directly in an if statement.",
                hint_2: "Print True for non-empty input and False for empty input.",
            },
        },
        {
            title: "Check whether a number is zero",
            prompt:
                "Read one integer. Print `True` when the number is 0 and `False` when it is not 0.",
            starterCode: "n = int(input())\n# Your code here\n",
            solutionCode:
                "n = int(input())\nif n == 0:\n    print(True)\nelse:\n    print(False)\n",
            tests: [
                { stdin: "0\n", stdout: "True\n", match: "exact" as const },
                { stdin: "7\n", stdout: "False\n", match: "exact" as const },
            ],
            hint: "Compare the input with zero before printing the boolean result.",
            help: {
                concept: "A comparison expression can check whether a value equals zero.",
                hint_1: "Use == to compare the number with 0.",
                hint_2: "Print True only in the matching case.",
            },
        },
    ];
    const config = prompts[(index - 1) % prompts.length];

    return {
        id,
        kind: "code_input",
        ...config,
    };
}

function buildGenericCodeInputExercise(
    id: string,
    index = 1,
): PythonDraftExercise {
    const prompts = [
        {
            title: "Print whether a number is positive",
            prompt:
                "Read one integer. Print `True` when the number is greater than 0 and `False` otherwise.",
            starterCode: "n = int(input())\n# Your code here\n",
            solutionCode:
                "n = int(input())\nif n > 0:\n    print(True)\nelse:\n    print(False)\n",
            tests: [
                { stdin: "5\n", stdout: "True\n", match: "exact" as const },
                { stdin: "0\n", stdout: "False\n", match: "exact" as const },
            ],
            hint: "Use a conditional check and return a boolean result.",
            help: {
                concept:
                    "A conditional can decide which boolean value to print based on a comparison.",
                hint_1: "Compare the number with zero inside an if statement.",
                hint_2: "Print True when the condition passes; otherwise print False.",
            },
        },
        {
            title: "Print whether a number is even",
            prompt:
                "Read one integer. Print `True` when the number is even and `False` when it is odd.",
            starterCode: "n = int(input())\n# Your code here\n",
            solutionCode:
                "n = int(input())\nif n % 2 == 0:\n    print(True)\nelse:\n    print(False)\n",
            tests: [
                { stdin: "8\n", stdout: "True\n", match: "exact" as const },
                { stdin: "5\n", stdout: "False\n", match: "exact" as const },
            ],
            hint: "Use the remainder after dividing by 2.",
            help: {
                concept: "Even numbers have remainder 0 when divided by 2.",
                hint_1: "Use % 2 to check the remainder.",
                hint_2: "Print True only for the even case.",
            },
        },
        {
            title: "Print whether a number is negative",
            prompt:
                "Read one integer. Print `True` when the number is less than 0 and `False` otherwise.",
            starterCode: "n = int(input())\n# Your code here\n",
            solutionCode:
                "n = int(input())\nif n < 0:\n    print(True)\nelse:\n    print(False)\n",
            tests: [
                { stdin: "-2\n", stdout: "True\n", match: "exact" as const },
                { stdin: "3\n", stdout: "False\n", match: "exact" as const },
            ],
            hint: "Compare the value with zero.",
            help: {
                concept: "A less-than comparison can detect negative numbers.",
                hint_1: "Use < 0 inside an if statement.",
                hint_2: "Print False for zero or positive values.",
            },
        },
    ];
    const config = prompts[(index - 1) % prompts.length];

    return {
        id,
        kind: "code_input",
        ...config,
    };
}

function buildFallbackExercise(args: {
    seed: TopicSeed;
    kind: "fill_blank_choice" | "code_input";
    index: number;
}): PythonDraftExercise {
    const id = `policy_${args.kind}_${args.index}`;

    if (args.kind === "fill_blank_choice") {
        if (looksLikeConditionalTopic(args.seed)) {
            return buildConditionalFillBlankExercise(id);
        }

        return buildGenericFillBlankExercise(id);
    }

    if (looksLikeTruthinessTopic(args.seed)) {
        return buildTruthinessCodeInputExercise(id, args.index);
    }

    return buildGenericCodeInputExercise(id, args.index);
}

function hasClassDefinition(exercise: PythonCodeInputExercise): boolean {
    return /^class\s+[A-Za-z_]\w*\b/m.test(
        `${exercise.starterCode}\n${exercise.solutionCode}`,
    );
}

function hasTopLevelFunctionDefinition(exercise: PythonCodeInputExercise): boolean {
    return /^def\s+[A-Za-z_]\w*\s*\(/m.test(
        `${exercise.starterCode}\n${exercise.solutionCode}`,
    );
}
function normalizeCommaSeparatedStdinForFunctionParams(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    const signature = extractFunctionSignature(exercise);
    if (!signature || signature.params.length < 2) return null;

    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length < 1) return null;

    let changed = false;

    const nextTests = tests.map((test) => {
        const stdin = String(test.stdin ?? "");

        const lines = stdin
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        // Only repair the common bad shape:
        // "10, 10\n" for a two-param function.
        if (lines.length !== 1) return test;
        if (!lines[0]?.includes(",")) return test;

        const parts = lines[0]
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);

        if (parts.length !== signature.params.length) return test;

        changed = true;

        return {
            ...test,
            stdin: `${parts.join("\n")}\n`,
        };
    });

    if (!changed) return null;

    return {
        ...exercise,
        tests: nextTests,
    };
}
function synthesizeMissingTestsForExercise(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    if (Array.isArray(exercise.tests) && exercise.tests.length > 0) {
        return null;
    }

    const canSafelySynthesize =
        hasInputCalls(exercise) ||
        (!hasClassDefinition(exercise) && hasTopLevelFunctionDefinition(exercise));

    if (!canSafelySynthesize) {
        return null;
    }

    const haystack = `${exercise.title} ${exercise.prompt}`.toLowerCase();

    if (
        /\bpositive\b/.test(haystack) &&
        /\bnegative\b/.test(haystack) &&
        /\bzero\b/.test(haystack)
    ) {
        return {
            ...exercise,
            tests: [
                { stdin: "5\n", stdout: "Positive\n", match: "exact" },
                { stdin: "-2\n", stdout: "Negative\n", match: "exact" },
                { stdin: "0\n", stdout: "Zero\n", match: "exact" },
            ],
        };
    }

    if (/\btruth(y|iness)\b|\bfalsy\b|\bbool\b/.test(haystack)) {
        return {
            ...exercise,
            tests: [
                { stdin: "''\n", stdout: "False\n", match: "exact" },
                { stdin: "'Hello'\n", stdout: "True\n", match: "exact" },
            ],
        };
    }

    if (/\bgreater than 10\b/.test(haystack)) {
        return {
            ...exercise,
            tests: [
                { stdin: "15\n", stdout: "True\n", match: "exact" },
                { stdin: "5\n", stdout: "False\n", match: "exact" },
            ],
        };
    }

    if (/\bgreater than 0\b|\bpositive\b/.test(haystack)) {
        return {
            ...exercise,
            tests: [
                { stdin: "5\n", stdout: "True\n", match: "exact" },
                { stdin: "0\n", stdout: "False\n", match: "exact" },
            ],
        };
    }




    if (
        /\b(vote|voting|eligible|eligibility)\b/.test(haystack) &&
        /\bage\b/.test(haystack)
    ) {
        return {
            ...exercise,
            tests: [
                {
                    stdin: "17\n",
                    stdout: "You are not eligible to vote.\n",
                    match: "exact",
                },
                {
                    stdin: "18\n",
                    stdout: "You are eligible to vote.\n",
                    match: "exact",
                },
                {
                    stdin: "25\n",
                    stdout: "You are eligible to vote.\n",
                    match: "exact",
                },
            ],
        };
    }

    if (
        /\bgrade\b/.test(haystack) &&
        /\bscore\b/.test(haystack)
    ) {
        return {
            ...exercise,
            tests: [
                { stdin: "95\n", stdout: "Grade: A\n", match: "exact" },
                { stdin: "85\n", stdout: "Grade: B\n", match: "exact" },
                { stdin: "75\n", stdout: "Grade: C\n", match: "exact" },
                { stdin: "65\n", stdout: "Grade: D\n", match: "exact" },
                { stdin: "50\n", stdout: "Grade: F\n", match: "exact" },
            ],
        };
    }

    if (
        /\btemperature\b/.test(haystack) &&
        /\b(hot|warm|cold)\b/.test(haystack)
    ) {
        return {
            ...exercise,
            tests: [
                { stdin: "35\n", stdout: "It is hot.\n", match: "exact" },
                { stdin: "25\n", stdout: "It is warm.\n", match: "exact" },
                { stdin: "10\n", stdout: "It is cold.\n", match: "exact" },
            ],
        };
    }
    return null;
}

async function rewriteNoOutputNoArgFunctionExercise(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (!hasMissingOrBooleanishTests(exercise)) return null;
    if (hasInputCalls(exercise)) return null;

    const signature = extractFunctionSignature(exercise);
    if (!signature) return null;
    if (signature.params.length > 0) return null;

    const starterCode = String(exercise.starterCode ?? "").trimEnd();
    const solutionCode = String(exercise.solutionCode ?? "").trimEnd();

    if (!solutionCode) return null;

    const hasTopLevelCall = (source: string) => {
        const callPattern = new RegExp(
            `^(?:print\\s*\\(\\s*)?${signature.name}\\s*\\(`,
        );

        return String(source ?? "")
            .split("\n")
            .some((line) => {
                if (/^\s/.test(line)) return false;

                const trimmed = line.trim();

                if (trimmed.startsWith("def ")) return false;
                if (trimmed.startsWith("#")) return false;

                return callPattern.test(trimmed);
            });
    };

    if (hasTopLevelCall(solutionCode)) return null;

    const runner = getCodeRunner() ?? runLocalCode;

    const callOnlyCode = `${solutionCode}\n\n${signature.name}()`;

    const callOnlyRun = await runner({
        language: "python",
        code: callOnlyCode,
        stdin: "",
        limits: { timeoutMs: 4000 },
    });

    if (callOnlyRun.ok && String(callOnlyRun.stdout ?? "").trim().length > 0) {
        const repaired: PythonCodeInputExercise = {
            ...exercise,
            prompt: `${String(exercise.prompt ?? "").trim()} Then call the function so the output can be checked.`,
            starterCode: `${starterCode}\n\n${signature.name}()`,
            solutionCode: callOnlyCode,
            recipeType: "fixed_tests" as const,
        };

        return (await makeTestsFromNoInputSolution(repaired)) ?? repaired;
    }

    const printReturnCode = `${solutionCode}\n\nprint(${signature.name}())`;

    const printReturnRun = await runner({
        language: "python",
        code: printReturnCode,
        stdin: "",
        limits: { timeoutMs: 4000 },
    });

    const printReturnStdout = String(printReturnRun.stdout ?? "").trim();

    if (
        printReturnRun.ok &&
        printReturnStdout.length > 0 &&
        printReturnStdout !== "None"
    ) {
        const repaired: PythonCodeInputExercise = {
            ...exercise,
            prompt: `${String(exercise.prompt ?? "").trim()} Then call the function and print the returned result so it can be checked.`,
            starterCode: `${starterCode}\n\nprint(${signature.name}())`,
            solutionCode: printReturnCode,
            recipeType: "fixed_tests" as const,
        };

        return (await makeTestsFromNoInputSolution(repaired)) ?? repaired;
    }

    return null;
}
function rewriteBrowserSafeTracebackText(value: string): {
    next: string;
    changed: boolean;
} {
    const next = value
        .replace(
            /File\s+"[^"]+\.py",\s*line\s+(\d+),\s*in\s+<module>/g,
            "line $1, in code editor",
        )
        .replace(
            /\b[\w.-]+\.py\b/g,
            "the code editor",
        );

    return {
        next,
        changed: next !== value,
    };
}
function hasOnlyBooleanishOutputs(exercise: PythonCodeInputExercise): boolean {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length < 1) return false;

    return tests.every((test) => {
        const out = String(test.stdout ?? "").trim().toLowerCase();
        return out === "true" || out === "false";
    });
}


async function rewriteTestsToMatchSolutionExecution(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length < 1) return null;

    const solutionCode = String(exercise.solutionCode ?? "").trim();
    if (!solutionCode) return null;

    const runner = getCodeRunner() ?? runLocalCode;

    const repairedTests = [];
    let changed = false;

    for (const test of tests) {
        const files = mergePythonFixtureFiles(exercise.files, test.files);

        const run = await runner({
            language: "python",
            code: solutionCode,
            stdin: String(test.stdin ?? ""),
            ...(files ? { files } : {}),
            limits: { timeoutMs: 4000 },
        });

        if (!run.ok) return null;

        const actualStdout = String(run.stdout ?? "").trimEnd();
        const expectedStdout = String(test.stdout ?? "").trimEnd();
        const matchMode = test.match ?? "exact";

        const alreadyMatches =
            matchMode === "includes"
                ? actualStdout.includes(expectedStdout.trim())
                : actualStdout === expectedStdout;

        if (!alreadyMatches || test.match !== "exact") {
            changed = true;
        }

        repairedTests.push({
            ...test,
            stdout: actualStdout,
            match: "exact" as const,
        });
    }

    if (!changed) return null;

    return {
        ...exercise,
        recipeType: "fixed_tests",
        tests: repairedTests,
    };
}


function looksLikePlaceholderStdout(stdout: unknown): boolean {
    const out = String(stdout ?? "").trim();
    if (!out) return false;

    return (
        /\bshould\b/i.test(out) ||
        /^(expected|output|result)\b/i.test(out) ||
        /\bplaceholder\b/i.test(out)
    );
}

function hasOnlyPlaceholderOutputs(exercise: PythonCodeInputExercise): boolean {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length < 1) return false;

    return tests.every((test) => looksLikePlaceholderStdout(test.stdout));
}

function hasNoTests(exercise: PythonCodeInputExercise): boolean {
    return !Array.isArray(exercise.tests) || exercise.tests.length < 1;
}

function hasMissingOrBooleanishTests(exercise: PythonCodeInputExercise): boolean {
    return (
        hasNoTests(exercise) ||
        hasOnlyBooleanishOutputs(exercise) ||
        hasOnlyPlaceholderOutputs(exercise)
    );
}

function hasInputCalls(exercise: PythonCodeInputExercise): boolean {
    const haystack = `${exercise.starterCode}\n${exercise.solutionCode}`;
    return /\binput\s*\(/.test(haystack);
}
function hasAnyNonEmptyTestStdin(exercise: PythonCodeInputExercise): boolean {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];

    return tests.some((test) => String(test.stdin ?? "").trim().length > 0);
}

function stripTopLevelInputLines(source: string): {
    code: string;
    removed: number;
} {
    const lines = String(source ?? "").split("\n");
    let removed = 0;

    const kept = lines.filter((line) => {
        // Only remove top-level input calls. Do not touch indented input()
        // inside loops, functions, classes, or try blocks.
        if (/^\s/.test(line)) return true;

        const trimmed = line.trim();

        const isInputAssignment =
            /^[A-Za-z_]\w*\s*=\s*input\s*\([^)]*\)\s*$/.test(trimmed);

        const isBareInput =
            /^input\s*\([^)]*\)\s*$/.test(trimmed);

        if (isInputAssignment || isBareInput) {
            removed += 1;
            return false;
        }

        return true;
    });

    return {
        code: kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd(),
        removed,
    };
}

function repairNoStdinFileInputCalls(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    if ((exercise.recipeType ?? "fixed_tests") !== "fixed_tests") {
        return null;
    }

    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length < 1) return null;

    // If tests intentionally provide stdin, keep input().
    if (hasAnyNonEmptyTestStdin(exercise)) {
        return null;
    }

    const solutionCode = String(exercise.solutionCode ?? "");
    const starterCode = String(exercise.starterCode ?? "");

    // Only do this for file-reading exercises.
    if (referencedReadFiles(solutionCode).length < 1) {
        return null;
    }

    if (!/\binput\s*\(/.test(`${starterCode}\n${solutionCode}`)) {
        return null;
    }

    const strippedStarter = stripTopLevelInputLines(starterCode);
    const strippedSolution = stripTopLevelInputLines(solutionCode);

    if (strippedStarter.removed + strippedSolution.removed < 1) {
        return null;
    }

    return {
        ...exercise,
        starterCode: strippedStarter.code,
        solutionCode: strippedSolution.code,
        tests: tests.map((test) => ({
            ...test,
            stdin: "",
        })),
    };
}
async function rewritePlaceholderTestsFromSolutionExecution(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (!hasOnlyBooleanishOutputs(exercise)) return null;
    if (hasInputCalls(exercise)) return null;

    const solutionCode = String(exercise.solutionCode ?? "").trim();
    if (!solutionCode) return null;

    const runner = getCodeRunner() ?? runLocalCode;
    const run = await runner({
        language: "python",
        code: solutionCode,
        stdin: "",
        limits: { timeoutMs: 4000 },
    });

    if (!run.ok) return null;

    const stdout = String(run.stdout ?? "");
    if (!stdout.trim()) return null;

    const normalized = stdout.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") return null;

    return {
        ...exercise,
        tests: [
            {
                stdin: "",
                stdout,
                match: "exact",
            },
        ],
    };
}
function rewriteHardcodedInputVariableExercise(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length < 1) return null;

    const hasStdinTests = tests.some((test) =>
        String(test.stdin ?? "").trim().length > 0,
    );
    if (!hasStdinTests) return null;

    const solutionCode = String(exercise.solutionCode ?? "");
    const starterCode = String(exercise.starterCode ?? "");
    const haystack = `${exercise.title} ${exercise.prompt}`.toLowerCase();

    // age checker: age = 20 -> age = int(input())
    if (
        /\bage\b/.test(haystack) &&
        /^age\s*=\s*\d+\s*$/m.test(solutionCode) &&
        !/\binput\s*\(/.test(solutionCode)
    ) {
        return {
            ...exercise,
            starterCode: starterCode.replace(
                /^age\s*=\s*\d+\s*$/m,
                "age = int(input())",
            ),
            solutionCode: solutionCode.replace(
                /^age\s*=\s*\d+\s*$/m,
                "age = int(input())",
            ),
        };
    }

    // even/odd checker: number = 4 -> number = int(input())
    if (
        /\b(even|odd|number)\b/.test(haystack) &&
        /^number\s*=\s*-?\d+\s*$/m.test(solutionCode) &&
        !/\binput\s*\(/.test(solutionCode)
    ) {
        return {
            ...exercise,
            starterCode: starterCode.replace(
                /^number\s*=\s*-?\d+\s*$/m,
                "number = int(input())",
            ),
            solutionCode: solutionCode.replace(
                /^number\s*=\s*-?\d+\s*$/m,
                "number = int(input())",
            ),
        };
    }

    // grade checker: score = 85 -> score = int(input())
    if (
        /\b(grade|score)\b/.test(haystack) &&
        /^score\s*=\s*\d+\s*$/m.test(solutionCode) &&
        !/\binput\s*\(/.test(solutionCode)
    ) {
        return {
            ...exercise,
            starterCode: starterCode.replace(
                /^score\s*=\s*\d+\s*$/m,
                "score = int(input())",
            ),
            solutionCode: solutionCode.replace(
                /^score\s*=\s*\d+\s*$/m,
                "score = int(input())",
            ),
        };
    }

    return null;
}
function rewriteHardcodedPromptAlignedExercise(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    if (!hasOnlyBooleanishOutputs(exercise)) return null;

    const haystack = `${exercise.title} ${exercise.prompt} ${exercise.solutionCode}`.toLowerCase();

    if (/\beligible\b/.test(haystack) && /\bnot eligible\b/.test(haystack)) {
        return {
            ...exercise,
            starterCode:
                "age = int(input())\nis_citizen = input().strip().lower() == 'true'\n# Your code here",
            solutionCode:
                "age = int(input())\nis_citizen = input().strip().lower() == 'true'\nif age >= 18 and is_citizen:\n    print('Eligible')\nelse:\n    print('Not eligible')",
            tests: [
                { stdin: "20\ntrue\n", stdout: "Eligible\n", match: "exact" },
                { stdin: "16\ntrue\n", stdout: "Not eligible\n", match: "exact" },
                { stdin: "20\nfalse\n", stdout: "Not eligible\n", match: "exact" },
            ],
        };
    }

    if (
        /\bgrade\b/.test(haystack) &&
        /print\('a'\)|print\("a"\)|print\('b'\)|print\("b"\)|print\('c'\)|print\("c"\)|print\('f'\)|print\("f"\)/i.test(
            exercise.solutionCode,
        )
    ) {
        return {
            ...exercise,
            starterCode: "grade = int(input())\n# Your code here",
            solutionCode:
                "grade = int(input())\nif grade >= 90:\n    print('A')\nelif grade >= 80:\n    print('B')\nelif grade >= 70:\n    print('C')\nelse:\n    print('F')",
            tests: [
                { stdin: "95\n", stdout: "A\n", match: "exact" },
                { stdin: "85\n", stdout: "B\n", match: "exact" },
                { stdin: "72\n", stdout: "C\n", match: "exact" },
                { stdin: "50\n", stdout: "F\n", match: "exact" },
            ],
        };
    }

    return null;
}

function parseFunctionParams(raw: string): string[] {
    return String(raw ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => part.split("=")[0]?.trim() ?? "")
        .map((part) => part.split(":")[0]?.trim() ?? "")
        .filter(Boolean);
}

function extractTopLevelFunctionSignaturesFromSource(source: string): Array<{
    name: string;
    params: string[];
}> {
    return Array.from(
        String(source ?? "").matchAll(/^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/gm),
    )
        .map((match) => ({
            name: String(match[1] ?? "").trim(),
            params: parseFunctionParams(String(match[2] ?? "")),
        }))
        .filter((signature) => Boolean(signature.name));
}

function extractTopLevelFunctionNames(exercise: PythonCodeInputExercise): string[] {
    const names = [
        ...extractTopLevelFunctionSignaturesFromSource(
            String(exercise.starterCode ?? ""),
        ).map((signature) => signature.name),
        ...extractTopLevelFunctionSignaturesFromSource(
            String(exercise.solutionCode ?? ""),
        ).map((signature) => signature.name),
    ];

    return Array.from(new Set(names)).filter((name) => !name.startsWith("_"));
}

function extractFunctionSignature(exercise: PythonCodeInputExercise): {
    name: string;
    params: string[];
} | null {
    const sources = [exercise.starterCode, exercise.solutionCode, exercise.prompt];

    for (const source of sources) {
        const match = extractTopLevelFunctionSignaturesFromSource(
            String(source ?? ""),
        )[0];

        if (match) return match;
    }

    return null;
}
function looksLikeFunctionReturnExercise(exercise: PythonCodeInputExercise): boolean {
    const prompt = String(exercise.prompt ?? "").toLowerCase();
    const starterCode = String(exercise.starterCode ?? "");
    const solutionCode = String(exercise.solutionCode ?? "");
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    const looksLikeFunctionExercise =
        /\b(create|write|define)\s+a?\s*function\b/.test(prompt) ||
        /\breturn\b/.test(prompt) ||
        starterCode.trimStart().startsWith("def ");
    const usesStdoutTests = tests.some(
        (test) =>
            typeof test.stdout === "string" &&
            test.stdout.trim().length > 0 &&
            !looksLikePlaceholderStdout(test.stdout),
    );
    const solutionPrints = /\bprint\s*\(/.test(solutionCode);

    return looksLikeFunctionExercise && usesStdoutTests && !solutionPrints;
}

function buildFunctionStdoutWrapper(args: {
    functionName: string;
    params: string[];
}): string {
    const assignments =
        args.params.length > 0
            ? args.params
                  .map(
                      (param, index) =>
                          `${param} = _parse_arg(_inputs[${index}]) if len(_inputs) > ${index} else ""`,
                  )
                  .join("\n")
            : "";
    const invocation =
        args.params.length > 0
            ? `${args.functionName}(${args.params.join(", ")})`
            : `${args.functionName}()`;

    return [
        "",
        "import ast",
        "",
        "def _parse_arg(raw):",
        "    try:",
        "        return ast.literal_eval(raw)",
        "    except Exception:",
        "        return raw",
        "",
        "_inputs = []",
        "try:",
        "    while True:",
        "        _inputs.append(input())",
        "except EOFError:",
        "    pass",
        ...(assignments ? [assignments, ""] : []),
        `print(${invocation})`,
        "",
    ].join("\n");
}

function rewriteFunctionReturnExercise(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    if (!looksLikeFunctionReturnExercise(exercise)) return null;

    const signature = extractFunctionSignature(exercise);
    if (!signature) return null;

    const wrapper = buildFunctionStdoutWrapper({
        functionName: signature.name,
        params: signature.params,
    });
    const prompt = String(exercise.prompt ?? "").trim();
    const needsPromptAppend = !/\bprint\b/i.test(prompt);
    const helperSentence =
        signature.params.length === 1
            ? " Then read the input value, call the function, and print the returned result."
            : " Then read the input values, call the function, and print the returned result.";

    return {
        ...exercise,
        prompt: needsPromptAppend ? `${prompt}${helperSentence}` : prompt,
        starterCode: `${String(exercise.starterCode ?? "").trimEnd()}\n${wrapper}`,
        solutionCode: `${String(exercise.solutionCode ?? "").trimEnd()}\n${wrapper}`,
    };
}

function stripInputPromptArguments(source: string): string {
    return String(source ?? "").replace(
        /input\s*\(\s*(["'`])(?:\\.|(?!\1).)*\1\s*\)/g,
        "input()",
    );
}

function rewritePromptedInputExercise(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    const starterCode = String(exercise.starterCode ?? "");
    const solutionCode = String(exercise.solutionCode ?? "");

    if (!/input\s*\(\s*["'`]/.test(`${starterCode}\n${solutionCode}`)) {
        return null;
    }

    return {
        ...exercise,
        starterCode: stripInputPromptArguments(starterCode),
        solutionCode: stripInputPromptArguments(solutionCode),
    };
}

function stripTrailingFunctionExampleUsage(args: {
    source: string;
    functionName: string;
}) {
    const lines = String(args.source ?? "").split("\n");
    let cutIndex = lines.length;

    for (let index = 0; index < lines.length; index += 1) {
        const trimmed = (lines[index] ?? "").trim();

        if (/^#\s*example usage\b/i.test(trimmed)) {
            cutIndex = Math.min(cutIndex, index);
            break;
        }

        if (
            new RegExp(`^print\\s*\\(\\s*${args.functionName}\\s*\\(`).test(trimmed) ||
            new RegExp(`^${args.functionName}\\s*\\(`).test(trimmed)
        ) {
            cutIndex = Math.min(cutIndex, index);
            break;
        }
    }

    return lines.slice(0, cutIndex).join("\n").trimEnd();
}
function normalizePythonLiteralText(raw: string): string {
    return String(raw ?? "")
        .trim()
        .replace(/\bTrue\b/g, "true")
        .replace(/\bFalse\b/g, "false")
        .replace(/\bNone\b/g, "null")
        .replace(/'/g, '"');
}

function parsePythonLiteralForSemantic(raw: string): unknown {
    const text = String(raw ?? "").trim();

    if (!text) return "";

    if (text === "True") return true;
    if (text === "False") return false;
    if (text === "None") return null;

    if (/^-?\d+$/.test(text)) {
        return Number.parseInt(text, 10);
    }

    if (/^-?\d+\.\d+$/.test(text)) {
        return Number.parseFloat(text);
    }

    if (
        (text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'"))
    ) {
        try {
            return JSON.parse(text.replace(/^'/, '"').replace(/'$/, '"'));
        } catch {
            return text.slice(1, -1);
        }
    }

    if (
        (text.startsWith("[") && text.endsWith("]")) ||
        (text.startsWith("{") && text.endsWith("}"))
    ) {
        try {
            return JSON.parse(normalizePythonLiteralText(text));
        } catch {
            return text;
        }
    }

    return text;
}

function splitSemanticFunctionArgs(stdin: string, paramCount: number): unknown[] {
    const raw = String(stdin ?? "");

    if (paramCount < 1) return [];

    if (paramCount === 1) {
        return [parsePythonLiteralForSemantic(raw)];
    }

    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    while (lines.length < paramCount) {
        // Match the old fixed-test repair behavior:
        // when generated tests provide too few stdin values for a function,
        // use 1 as a safe default because it works for arithmetic/int examples
        // and avoids division-by-zero edge cases.
        lines.push("1");
    }

    return lines
        .slice(0, paramCount)
        .map((line) => parsePythonLiteralForSemantic(line));
}

function parseSemanticExpectedFromStdout(stdout: string): unknown {
    return parsePythonLiteralForSemantic(String(stdout ?? "").trimEnd());
}

function convertFunctionReturnFixedTestsToSemantic(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    if ((exercise.recipeType ?? "fixed_tests") === "semantic") return null;
    if (Array.isArray(exercise.semanticChecks) && exercise.semanticChecks.length > 0) {
        return null;
    }

    if (hasInputCalls(exercise)) return null;

    const topLevelFunctionNames = extractTopLevelFunctionNames(exercise);

// This repair is only for one focused return-value function.
// Multi-function project steps should stay runnable programs, not semantic
// function_returns exercises.
    if (topLevelFunctionNames.length !== 1) return null;

    const signature = extractFunctionSignature(exercise);
    if (!signature) return null;
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length < 1) return null;

    const usableTests = tests.filter((test) => {
        const stdout = String(test.stdout ?? "").trim();
        if (!stdout) return false;
        if (looksLikePlaceholderStdout(stdout)) return false;
        return true;
    });

    if (usableTests.length < 1) return null;

    const prompt = String(exercise.prompt ?? "").toLowerCase();
    const starterCode = String(exercise.starterCode ?? "");
    const solutionCode = String(exercise.solutionCode ?? "");

    const looksLikeReturnTask =
        /\breturn\b/.test(prompt) ||
        /\bwrite\s+a\s+function\b/.test(prompt) ||
        /\bcreate\s+a\s+function\b/.test(prompt) ||
        /\bdefine\s+a\s+function\b/.test(prompt) ||
        starterCode.trimStart().startsWith("def ");

    if (!looksLikeReturnTask) return null;

    if (/\b_parse_arg\b|\bast\.literal_eval\b/.test(`${starterCode}\n${solutionCode}`)) {
        return null;
    }

    const strippedStarter = stripTrailingFunctionExampleUsage({
        source: starterCode,
        functionName: signature.name,
    });

    const strippedSolution = stripTrailingFunctionExampleUsage({
        source: solutionCode,
        functionName: signature.name,
    });

    if (!/\breturn\b/.test(strippedSolution)) return null;

    const semanticChecks: SemanticCheck[] = usableTests.map((test): SemanticCheck => ({
        type: "function_returns",
        functionName: signature.name,
        args: splitSemanticFunctionArgs(String(test.stdin ?? ""), signature.params.length),
        expected: parseSemanticExpectedFromStdout(String(test.stdout ?? "")),
        message: `Return the expected result for ${signature.name}(${signature.params.join(", ")}).`,
    }));

    semanticChecks.push({
        type: "no_stdout",
        message: "This task should return a value instead of printing output.",
    });

    const { tests: _removedTests, ...rest } = exercise;

    return {
        ...rest,
        recipeType: "semantic",
        starterCode: strippedStarter.trimEnd(),
        solutionCode: strippedSolution.trimEnd(),
        semanticChecks,
    };
}
function rewriteHardcodedFunctionExampleExercise(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    const signature = extractFunctionSignature(exercise);
    if (!signature) return null;
    if (hasInputCalls(exercise)) return null;
    if (/\b_parse_arg\b/.test(String(exercise.solutionCode ?? ""))) return null;
    if (
        !(Array.isArray(exercise.tests) &&
            exercise.tests.some((test) => String(test.stdin ?? "").trim().length > 0))
    ) {
        return null;
    }

    const solutionCode = String(exercise.solutionCode ?? "");
    const starterCode = String(exercise.starterCode ?? "");
    const hasHardcodedCall =
        new RegExp(`print\\s*\\(\\s*${signature.name}\\s*\\(`).test(solutionCode) ||
        new RegExp(`\\b${signature.name}\\s*\\(`).test(solutionCode.split("\n").slice(-3).join("\n"));

    if (!hasHardcodedCall) return null;

    const strippedSolution = stripTrailingFunctionExampleUsage({
        source: solutionCode,
        functionName: signature.name,
    });
    const strippedStarter = stripTrailingFunctionExampleUsage({
        source: starterCode,
        functionName: signature.name,
    });
    const wrapper = buildFunctionStdoutWrapper({
        functionName: signature.name,
        params: signature.params,
    });

    return {
        ...exercise,
        prompt: `${String(exercise.prompt ?? "").trim()} Then read the input values, call the function, and print the returned result.`,
        starterCode: `${strippedStarter}\n${wrapper}`.trim(),
        solutionCode: `${strippedSolution}\n${wrapper}`.trim(),
    };
}

function looksLikeEmbeddedPythonHarness(stdin: string): boolean {
    const lines = String(stdin ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length < 1) return false;

    return lines.some(
        (line) =>
            /^[A-Za-z_]\w*\s*=/.test(line) ||
            /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\(.*\)$/.test(line),
    );
}

function looksLikeBareClassInstantiationLine(line: string): boolean {
    return /^[A-Z][A-Za-z_]\w*\s*\(.*\)$/.test(String(line ?? "").trim());
}

function wrapFinalHarnessExpression(lines: string[]): string[] {
    if (lines.length < 1) return lines;

    const next = [...lines];
    const lastIndex = next.length - 1;
    const last = next[lastIndex]?.trim() ?? "";

    if (!last) return next;
    if (/^print\s*\(/.test(last)) return next;
    if (/^[A-Za-z_]\w*\s*=/.test(last)) return next;
    if (looksLikeBareClassInstantiationLine(last)) return next;
    if (/^(if|elif|else|for|while|def|class|return|import|from)\b/.test(last)) {
        return next;
    }

    next[lastIndex] = `print(${last})`;
    return next;
}

function normalizePythonLineForHarnessCompare(line: string): string {
    return String(line ?? "")
        .replace(/\s+#.*$/, "")
        .trim();
}

function sourceAlreadyContainsHarnessLine(source: string, harnessLine: string): boolean {
    const normalizedHarnessLine = normalizePythonLineForHarnessCompare(harnessLine);
    if (!normalizedHarnessLine) return true;

    return String(source ?? "")
        .split("\n")
        .some(
            (line) =>
                normalizePythonLineForHarnessCompare(line) === normalizedHarnessLine,
        );
}

function appendMissingHarness(source: string, harnessLines: string[]): string {
    const missingLines = harnessLines.filter(
        (line) => !sourceAlreadyContainsHarnessLine(source, line),
    );

    if (missingLines.length < 1) return String(source ?? "").trimEnd();

    return `${String(source ?? "").trimEnd()}\n\n${missingLines.join("\n")}`;
}

async function rewriteEmbeddedHarnessStyleExercise(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length !== 1) return null;
    if (hasInputCalls(exercise)) return null;

    const stdin = String(tests[0]?.stdin ?? "");
    if (!looksLikeEmbeddedPythonHarness(stdin)) return null;

    const harnessLines = wrapFinalHarnessExpression(
        stdin
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0),
    );
    if (harnessLines.length < 1) return null;

    const withHarness: PythonCodeInputExercise = {
        ...exercise,
        prompt: `${String(exercise.prompt ?? "").trim()} Use the provided object creation code to print the final result.`,
        starterCode: appendMissingHarness(
            String(exercise.starterCode ?? ""),
            harnessLines,
        ),
        solutionCode: appendMissingHarness(
            String(exercise.solutionCode ?? ""),
            harnessLines,
        ),
        tests: [
            {
                stdin: "",
                stdout: String(tests[0]?.stdout ?? ""),
                match: tests[0]?.match ?? "exact",
            },
        ],
    };

    return (await makeTestsFromNoInputSolution(withHarness)) ?? withHarness;
}

function insertClassMethodIfMissing(args: {
    source: string;
    className: string;
    methodName: string;
    methodLines: string[];
}): string {
    const source = String(args.source ?? "");
    const methodPattern = new RegExp(`^    def\\s+${args.methodName}\\b`, "m");
    if (methodPattern.test(source)) return source;

    const lines = source.split("\n");
    const classIndex = lines.findIndex((line) =>
        new RegExp(`^class\\s+${args.className}\\b.*:\\s*$`).test(line),
    );
    if (classIndex < 0) return source;

    let insertAt = lines.length;

    for (let index = classIndex + 1; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (line.trim() && !/^\s/.test(line)) {
            insertAt = index;
            break;
        }
    }

    const before = lines.slice(0, insertAt);
    const after = lines.slice(insertAt);
    const spacer =
        before.length > 0 && String(before[before.length - 1] ?? "").trim()
            ? [""]
            : [];

    return [...before, ...spacer, ...args.methodLines, "", ...after].join("\n").trimEnd();
}

async function rewriteMissingOopSupportMethods(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    const solutionCode = String(exercise.solutionCode ?? "");

    if (!/\.get_balance\s*\(/.test(solutionCode)) return null;
    if (/^    def\s+get_balance\b/m.test(solutionCode)) return null;
    if (!/self\.__balance\b/.test(solutionCode)) return null;

    const classMatch = solutionCode.match(/^class\s+([A-Za-z_]\w*)\b.*:\s*$/m);
    const className = classMatch?.[1];
    if (!className) return null;

    const starterCode = insertClassMethodIfMissing({
        source: String(exercise.starterCode ?? ""),
        className,
        methodName: "get_balance",
        methodLines: [
            "    def get_balance(self):",
            "        return self.__balance",
        ],
    });
    const repairedSolutionCode = insertClassMethodIfMissing({
        source: solutionCode,
        className,
        methodName: "get_balance",
        methodLines: [
            "    def get_balance(self):",
            "        return self.__balance",
        ],
    });

    const repaired: PythonCodeInputExercise = {
        ...exercise,
        starterCode,
        solutionCode: repairedSolutionCode,
    };

    return (await makeTestsFromNoInputSolution(repaired)) ?? repaired;
}

type PythonClassDefinition = {
    name: string;
    header: string;
    methods: Map<string, string[]>;
};

function extractPythonClassDefinitions(source: string): PythonClassDefinition[] {
    const lines = String(source ?? "").split("\n");
    const definitions: PythonClassDefinition[] = [];

    for (let i = 0; i < lines.length; i += 1) {
        const header = lines[i] ?? "";
        const match = header.match(/^class\s+([A-Za-z_]\w*)\b.*:\s*$/);
        if (!match) continue;

        const blockLines = [header];
        let j = i + 1;

        while (j < lines.length) {
            const line = lines[j] ?? "";
            if (line.trim() && !/^\s/.test(line)) break;
            blockLines.push(line);
            j += 1;
        }

        const methods = new Map<string, string[]>();

        for (let k = 1; k < blockLines.length; k += 1) {
            const methodMatch = (blockLines[k] ?? "").match(/^    def\s+([A-Za-z_]\w*)\b/);
            if (!methodMatch) continue;

            const methodName = methodMatch[1]!;
            const methodLines = [blockLines[k] ?? ""];
            let m = k + 1;

            while (m < blockLines.length) {
                const line = blockLines[m] ?? "";
                if (/^    def\s+[A-Za-z_]\w*\b/.test(line)) break;
                if (line.trim() && !/^ {5,}|\t/.test(line)) break;
                methodLines.push(line);
                m += 1;
            }

            methods.set(methodName, methodLines);
        }

        definitions.push({
            name: match[1]!,
            header,
            methods,
        });
        i = j - 1;
    }

    return definitions;
}

function mergeClassDefinitions(
    exercises: readonly PythonDraftExercise[],
): Map<string, PythonClassDefinition> {
    const merged = new Map<string, PythonClassDefinition>();

    for (const exercise of exercises) {
        if (exercise.kind !== "code_input") continue;

        for (const definition of extractPythonClassDefinitions(exercise.solutionCode)) {
            const existing = merged.get(definition.name);

            if (!existing) {
                merged.set(definition.name, {
                    name: definition.name,
                    header: definition.header,
                    methods: new Map(definition.methods),
                });
                continue;
            }

            for (const [methodName, methodLines] of definition.methods) {
                existing.methods.set(methodName, methodLines);
            }
        }
    }

    return merged;
}

function renderClassDefinition(definition: PythonClassDefinition): string {
    const methodBlocks = Array.from(definition.methods.values())
        .map((lines) => lines.join("\n").trimEnd())
        .filter(Boolean);

    if (methodBlocks.length < 1) {
        return `${definition.header}\n    pass`;
    }

    return `${definition.header}\n${methodBlocks.join("\n\n")}`;
}

function referencesClass(source: string, className: string): boolean {
    return new RegExp(`\\b${className}\\s*\\(`).test(source);
}

function referencesName(source: string, name: string): boolean {
    return new RegExp(`\\b${name}\\b`).test(source);
}
function isSemanticCodeExercise(exercise: PythonDraftExercise): boolean {
    return (
        exercise.kind === "code_input" &&
        (
            exercise.recipeType === "semantic" ||
            (
                Array.isArray(exercise.semanticChecks) &&
                exercise.semanticChecks.length > 0
            )
        )
    );
}

function stripFixedTestsFromSemanticCodeExercise(
    exercise: PythonCodeInputExercise,
): {
    exercise: PythonCodeInputExercise;
    removedCount: number;
} {
    if (!isSemanticCodeExercise(exercise)) {
        return { exercise, removedCount: 0 };
    }

    const removedCount = Array.isArray(exercise.tests) ? exercise.tests.length : 0;

    if (removedCount < 1 && exercise.recipeType === "semantic") {
        return { exercise, removedCount: 0 };
    }

    const { tests: _fixedStdoutTests, ...rest } = exercise;

    return {
        exercise: {
            ...rest,
            recipeType: "semantic",
        },
        removedCount,
    };
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// function referencesName(source: string, name: string): boolean {
//     return new RegExp(`\\b${escapeRegExp(name)}\\b`).test(source);
// }

function definesTopLevelName(source: string, name: string): boolean {
    return new RegExp(`^${escapeRegExp(name)}\\s*=`, "m").test(source);
}

function isUnsafeSharedSetupLine(line: string): boolean {
    const trimmed = line.trim();

    if (!trimmed) return true;

    // Never share input/file setup between exercises.
    if (/\binput\s*\(/.test(trimmed)) return true;
    if (/\bopen\s*\(|\.read_text\s*\(|\.open\s*\(/.test(trimmed)) return true;

    // Never share derived cleanup lines like:
    // name = name.strip()
    // parts = row.split(",")
    // score_text = row["score"].strip()
    // These depend on local function parameters or previous local variables.
    // Reject derived expressions such as:
// name = name.strip()
// item = rows[0]
// value = helper(...)
//
// But allow safe object construction like:
// book1 = Book('1984', 'George Orwell')
    if (/^[A-Za-z_]\w*\s*=\s*[A-Za-z_]\w*(?:\.|\[)/.test(trimmed)) {
        return true;
    }

    if (/^[A-Za-z_]\w*\s*=\s*[a-z_]\w*\s*\(/.test(trimmed)) {
        return true;
    }

    // Avoid sharing common scratch variables across unrelated exercises.
    if (/^(text|line|row|rows|parts|name|age|score|score_text|value|number|total|count)\s*=/.test(trimmed)) {
        return true;
    }

    return false;
}
function isSafeSharedSetupAssignment(line: string): boolean {
    const trimmed = line.trim();

    if (isUnsafeSharedSetupLine(trimmed)) return false;

    const simpleLiteralOrContainer =
        /^[A-Za-z_]\w*\s*=\s*(-?\d+(?:\.\d+)?|True|False|None|"[^"]*"|'[^']*'|\[.*\]|\{.*\}|\(.*\))\s*$/.test(
            trimmed,
        );

    if (simpleLiteralOrContainer) return true;

    // Allow safe constructor setup that depends only on literal arguments.
    // Example:
    // book1 = Book('1984', 'George Orwell')
    const safeConstructorAssignment =
        /^[A-Za-z_]\w*\s*=\s*[A-Z][A-Za-z_]\w*\s*\(\s*(?:(?:-?\d+(?:\.\d+)?|True|False|None|"[^"]*"|'[^']*')\s*,\s*)*(?:-?\d+(?:\.\d+)?|True|False|None|"[^"]*"|'[^']*')?\s*\)\s*$/.test(
            trimmed,
        );

    if (safeConstructorAssignment) return true;

    return false;
}
// function definesTopLevelName(source: string, name: string): boolean {
//     return new RegExp(`^${name}\\s*=`, "m").test(source);
// }

function extractTopLevelSetupDefinitions(source: string): Map<string, string[]> {
    const lines = String(source ?? "").split("\n");
    const definitions = new Map<string, string[]>();
    const setupLines: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";

        if (/^(class|def)\s+[A-Za-z_]\w*/.test(line)) {
            index += 1;
            while (index < lines.length) {
                const nextLine = lines[index] ?? "";
                if (nextLine.trim() && !/^\s/.test(nextLine)) {
                    index -= 1;
                    break;
                }
                index += 1;
            }
            continue;
        }

        const assignmentMatch = line.match(/^([A-Za-z_]\w*)\s*=/);
        if (!assignmentMatch) continue;

        if (!isSafeSharedSetupAssignment(line)) {
            continue;
        }

        setupLines.push(line);
        definitions.set(assignmentMatch[1]!, [...setupLines]);
    }

    return definitions;
}
function mergeTopLevelSetupDefinitions(
    exercises: readonly PythonDraftExercise[],
): Map<string, string[]> {
    const merged = new Map<string, string[]>();

    for (const exercise of exercises) {
        if (exercise.kind !== "code_input") continue;

        for (const [name, lines] of extractTopLevelSetupDefinitions(exercise.solutionCode)) {
            if (!merged.has(name)) {
                merged.set(name, lines);
            }
        }
    }

    return merged;
}

async function makeTestsFromNoInputSolution(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (hasInputCalls(exercise)) return null;

    const solutionCode = String(exercise.solutionCode ?? "").trim();
    if (!solutionCode) return null;

    const runner = getCodeRunner() ?? runLocalCode;
    const run = await runner({
        language: "python",
        code: solutionCode,
        stdin: "",
        limits: { timeoutMs: 4000 },
    });

    if (!run.ok) return null;

    const stdout = String(run.stdout ?? "");
    if (!stdout.trim()) return null;

    return {
        ...exercise,
        tests: [
            {
                stdin: "",
                stdout,
                match: "exact",
            },
        ],
    };
}

function rewriteLastTopLevelExpressionAsPrint(source: string): string | null {
    const lines = String(source ?? "").split("\n");

    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index] ?? "";
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;
        if (/^\s/.test(line)) return null;

        const wrapped = wrapFinalHarnessExpression([trimmed])[0] ?? trimmed;
        if (wrapped === trimmed || !wrapped.startsWith("print(")) return null;

        lines[index] = wrapped;
        return lines.join("\n").trimEnd();
    }

    return null;
}

async function rewriteNoInputFinalExpressionExercise(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (!hasMissingOrBooleanishTests(exercise)) return null;
    if (hasInputCalls(exercise)) return null;

    const solutionCode = rewriteLastTopLevelExpressionAsPrint(
        String(exercise.solutionCode ?? ""),
    );
    if (!solutionCode) return null;

    const starterCode =
        rewriteLastTopLevelExpressionAsPrint(String(exercise.starterCode ?? "")) ??
        String(exercise.starterCode ?? "");

    const repaired: PythonCodeInputExercise = {
        ...exercise,
        prompt: `${String(exercise.prompt ?? "").trim()} Print the final result so it can be checked.`,
        starterCode,
        solutionCode,
    };

    return (await makeTestsFromNoInputSolution(repaired)) ?? null;
}

function findLastListAssignmentName(source: string): string | null {
    const matches = Array.from(
        String(source ?? "").matchAll(/^([A-Za-z_]\w*)\s*=\s*\[/gm),
    );
    const last = matches[matches.length - 1];
    return last?.[1] ?? null;
}

function pythonLiteralForConstructorParam(paramName: string): string {
    const normalized = paramName.toLowerCase();

    if (/\b(age|count|quantity|amount|balance|score|grade)\b/.test(normalized)) {
        return "1";
    }

    if (/\byear\b/.test(normalized)) return "2020";
    if (/\bpages?\b/.test(normalized)) return "328";
    if (/\b(active|enabled|citizen|valid)\b/.test(normalized)) {
        return "True";
    }
    if (/\btitle\b/.test(normalized)) return "'1984'";
    if (/\bauthor\b/.test(normalized)) return "'George Orwell'";
    if (/\bmake|brand\b/.test(normalized)) return "'Toyota'";
    if (/\bmodel\b/.test(normalized)) {
        return "'Corolla'";
    }
    if (/\bname\b/.test(normalized)) {
        return "'Alex'";
    }

    return "'Example'";
}

function variableNameForClass(className: string): string {
    const base = `${className.charAt(0).toLowerCase()}${className.slice(1)}`;
    return /^[A-Za-z_]\w*$/.test(base) ? base : "obj";
}

function extractInitParams(source: string, className: string): string[] {
    const classPattern = new RegExp(
        `class\\s+${className}\\b[\\s\\S]*?def\\s+__init__\\s*\\(([^)]*)\\)\\s*:`,
    );
    const match = String(source ?? "").match(classPattern);
    if (!match) return [];

    return String(match[1] ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => part.split("=")[0]?.trim() ?? "")
        .map((part) => part.split(":")[0]?.trim() ?? "")
        .filter((part) => part && part !== "self");
}

function buildNoInputClassMethodHarness(source: string): string[] | null {
    const classMatch = String(source ?? "").match(
        /^class\s+([A-Za-z_]\w*)\b.*:\s*$/m,
    );

    const className = classMatch?.[1];
    if (!className) return null;

    const constructorParams = extractInitParams(source, className);
    const publicZeroArgMethods = Array.from(
        String(source ?? "").matchAll(
            /^    def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/gm,
        ),
    )
        .map((match) => {
            const name = match[1] ?? "";
            const params = String(match[2] ?? "")
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean)
                .map((part) => part.split("=")[0]?.trim() ?? "")
                .map((part) => part.split(":")[0]?.trim() ?? "");

            return { name, params };
        })
        .filter((method) => method.name !== "__init__")
        .filter((method) => !method.name.startsWith("_"))
        .filter((method) => {
            const nonSelfParams = method.params.filter((param) => param !== "self");
            return nonSelfParams.length === 0;
        });

    if (publicZeroArgMethods.length < 1) return null;

    const varName = variableNameForClass(className);
    const args = constructorParams.map(pythonLiteralForConstructorParam);

    return [
        `${varName} = ${className}(${args.join(", ")})`,
        ...publicZeroArgMethods.map(
            (method) => `print(${varName}.${method.name}())`,
        ),
    ];
}

async function rewriteNoOutputClassMethodExercise(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (!hasMissingOrBooleanishTests(exercise)) return null;
    if (hasInputCalls(exercise)) return null;

    const solutionCode = String(exercise.solutionCode ?? "");
    const run = await (getCodeRunner() ?? runLocalCode)({
        language: "python",
        code: solutionCode,
        stdin: "",
        limits: { timeoutMs: 4000 },
    });

    if (!run.ok) return null;
    if (String(run.stdout ?? "").trim()) return null;

    const harnessLines = buildNoInputClassMethodHarness(solutionCode);
    if (!harnessLines) return null;

    const repaired: PythonCodeInputExercise = {
        ...exercise,
        prompt: `${String(exercise.prompt ?? "").trim()} Then create an instance and print the method result.`,
        starterCode: appendMissingHarness(
            String(exercise.starterCode ?? ""),
            harnessLines,
        ),
        solutionCode: appendMissingHarness(
            String(exercise.solutionCode ?? ""),
            harnessLines,
        ),
    };

    return (await makeTestsFromNoInputSolution(repaired)) ?? repaired;
}

async function rewriteNoOutputListConstructionExercise(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (!hasMissingOrBooleanishTests(exercise)) return null;
    if (hasInputCalls(exercise)) return null;

    const haystack = `${exercise.title} ${exercise.prompt}`.toLowerCase();
    if (!/\blists?\b|\bcollection\b/.test(haystack)) return null;

    const listName = findLastListAssignmentName(exercise.solutionCode);
    if (!listName) return null;

    const run = await (getCodeRunner() ?? runLocalCode)({
        language: "python",
        code: String(exercise.solutionCode ?? ""),
        stdin: "",
        limits: { timeoutMs: 4000 },
    });

    if (!run.ok) return null;
    if (String(run.stdout ?? "").trim()) return null;

    const observableLine = `print(len(${listName}))`;
    const repaired: PythonCodeInputExercise = {
        ...exercise,
        prompt: `${String(exercise.prompt ?? "").trim()} Then print the number of items in the list.`,
        starterCode: `${String(exercise.starterCode ?? "").trimEnd()}\n${observableLine}`,
        solutionCode: `${String(exercise.solutionCode ?? "").trimEnd()}\n${observableLine}`,
    };

    return (await makeTestsFromNoInputSolution(repaired)) ?? repaired;
}

async function repairCrossExerciseClassDependencies(args: {
    draft: TopicAuthoringDraft;
    report: RepairReport;
}): Promise<TopicAuthoringDraft> {
    if (Array.isArray(args.draft.projectDraft?.stepIds) && args.draft.projectDraft.stepIds.length > 0) {
        return args.draft;
    }

    const classDefinitions = mergeClassDefinitions(args.draft.quizDraft);
    const setupDefinitions = mergeTopLevelSetupDefinitions(args.draft.quizDraft);
    if (classDefinitions.size < 1 && setupDefinitions.size < 1) return args.draft;

    const quizDraft = await Promise.all(
        args.draft.quizDraft.map(async (exercise) => {
            if (exercise.kind !== "code_input") return exercise;

            let nextExercise = exercise;
            const classPrefixes: string[] = [];
            const setupPrefixLines: string[] = [];

            for (const [className, definition] of classDefinitions) {
                if (!referencesClass(nextExercise.solutionCode, className)) continue;
                if (new RegExp(`^class\\s+${className}\\b`, "m").test(nextExercise.solutionCode)) {
                    continue;
                }

                classPrefixes.push(renderClassDefinition(definition));
            }

            // Semantic exercises should be self-contained.
// Do not prepend random top-level setup into function/class semantic tasks.
// It can crash before the semantic harness calls the function.
            if (!isSemanticCodeExercise(nextExercise)) {
                for (const [name, lines] of setupDefinitions) {
                    if (!referencesName(nextExercise.solutionCode, name)) continue;
                    if (definesTopLevelName(nextExercise.solutionCode, name)) continue;

                    const safeLines = lines.filter(isSafeSharedSetupAssignment);
                    if (safeLines.length < 1) continue;

                    for (const line of safeLines) {
                        if (!setupPrefixLines.includes(line)) {
                            setupPrefixLines.push(line);
                        }
                    }
                }
            }

            const setupPrefixSource = setupPrefixLines.join("\n");
            for (const [className, definition] of classDefinitions) {
                if (!referencesClass(setupPrefixSource, className)) continue;
                if (new RegExp(`^class\\s+${className}\\b`, "m").test(nextExercise.solutionCode)) {
                    continue;
                }

                const rendered = renderClassDefinition(definition);
                if (!classPrefixes.includes(rendered)) {
                    classPrefixes.push(rendered);
                }
            }

            if (classPrefixes.length < 1 && setupPrefixLines.length < 1) {
                return nextExercise;
            }

            const prefixParts = [
                ...classPrefixes,
                setupPrefixLines.length > 0 ? setupPrefixLines.join("\n") : "",
            ].filter(Boolean);
            const prefix = `${prefixParts.join("\n\n")}\n\n`;

            nextExercise = {
                ...nextExercise,
                starterCode: `${prefix}${String(nextExercise.starterCode ?? "").trimStart()}`,
                solutionCode: `${prefix}${String(nextExercise.solutionCode ?? "").trimStart()}`,
            };

            args.report.repairs.push({
                code: "PYTHON_CROSS_EXERCISE_CLASS_CONTEXT_REPAIRED",
                category: "recipe",
                severity: "high",
                field: exercise.id,
                message:
                    "Prepended shared class/setup context needed by this code_input exercise so it can run independently.",
            });

            if (!isSemanticCodeExercise(nextExercise) && hasMissingOrBooleanishTests(nextExercise)) {
                const testRepair =
                    (await makeTestsFromNoInputSolution(nextExercise)) ??
                    (await rewriteNoInputFinalExpressionExercise(nextExercise));

                if (testRepair) {
                    nextExercise = testRepair;

                    args.report.repairs.push({
                        code: "PYTHON_CROSS_EXERCISE_TESTS_REPAIRED",
                        category: "recipe",
                        severity: "high",
                        field: exercise.id,
                        message:
                            "Regenerated placeholder tests from the self-contained Python solution.",
                    });
                }
            }

            return nextExercise;
        }),
    );

    return {
        ...args.draft,
        quizDraft,
    };
}
function buildTopicAwareSingleChoiceFallback(
    seed: TopicSeed,
    id: string,
): PythonDraftExercise {
    return {
        id,
        kind: "single_choice",
        title: "Identify the result of running code",
        prompt: `In "${seed.title}", what should you check after running a Python program?`,
        options: [
            "The output shown by the program",
            "Only the file name",
            "Whether Python deletes the code",
            "Whether comments are printed automatically",
        ],
        correctOptionIds: ["a"],
        hint: "Running code lets you inspect what the program displays.",
        help: {
            concept: "When you run Python code, the most important feedback is usually the output or error message.",
            hint_1: "Look at the console or output area.",
            hint_2: "Printed values appear after the program runs.",
        },
    };
}

function buildTopicAwareMultiChoiceFallback(
    seed: TopicSeed,
    id: string,
): PythonDraftExercise {
    return {
        id,
        kind: "multi_choice",
        title: "Choose good run-and-check habits",
        prompt: `Which habits help when practicing "${seed.title}"?`,
        options: [
            "Run the code after writing it",
            "Read the output carefully",
            "Ignore error messages",
            "Change many lines at once without testing",
        ],
        correctOptionIds: ["a", "b"],
        hint: "Good practice means running code and checking what happened.",
        help: {
            concept: "Running small pieces of code and reading the output helps you understand Python behavior.",
            hint_1: "Output and errors both give useful feedback.",
            hint_2: "Testing small changes is easier than debugging many changes at once.",
        },
    };
}





function countNonEmptyStdinLines(stdin: unknown): number {
    return String(stdin ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean).length;
}

function normalizeFixedTestKey(test: {
    stdin?: unknown;
    stdout?: unknown;
    match?: unknown;
    files?: unknown;
}) {
    const files = Array.isArray(test.files)
        ? test.files
            .map((file) => {
                if (!file || typeof file !== "object") return null;

                const item = file as {
                    path?: unknown;
                    content?: unknown;
                };

                return {
                    path: String(item.path ?? ""),
                    content: String(item.content ?? ""),
                };
            })
            .filter(Boolean)
            .sort((a, b) => String(a?.path).localeCompare(String(b?.path)))
        : [];

    return JSON.stringify({
        stdin: String(test.stdin ?? ""),
        stdout: String(test.stdout ?? ""),
        match: test.match === "includes" ? "includes" : "exact",
        files,
    });
}

function hasMinimumDistinctFixedTests(
    exercise: PythonCodeInputExercise,
    minimum = PYTHON_MINIMUM_FIXED_TESTS,
) {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    return new Set(tests.map((test) => normalizeFixedTestKey(test))).size >= minimum;
}

function mutateStdinLine(line: string, variantIndex: number): string {
    const trimmed = line.trim();

    if (/^-?\d+$/.test(trimmed)) {
        return String(Number(trimmed) + variantIndex + 1);
    }

    if (/^-?\d+\.\d+$/.test(trimmed)) {
        return String(Number(trimmed) + (variantIndex + 1) * 0.5);
    }

    if (/^(true|false)$/i.test(trimmed)) {
        return /^true$/i.test(trimmed) ? "false" : "true";
    }

    if (/^[A-Za-z][A-Za-z0-9_ -]*$/.test(trimmed)) {
        const textAlternates = ["Bob", "Zoe", "Python"];
        const candidate = textAlternates[variantIndex % textAlternates.length] ?? "Bob";
        return candidate === trimmed ? `${candidate}${variantIndex + 2}` : candidate;
    }

    if (!trimmed) {
        return variantIndex % 2 === 0 ? "1" : "hello";
    }

    return `${trimmed}_${variantIndex + 2}`;
}

function buildAlternateStdinCandidates(
    exercise: PythonCodeInputExercise,
): string[] {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    const inputs = tests
        .map((test) => String(test.stdin ?? ""))
        .filter((stdin) => stdin.trim().length > 0);

    if (inputs.length < 1) return [];

    const candidates = new Set<string>();

    for (const stdin of inputs) {
        const lines = stdin
            .split("\n")
            .slice(0, -1)
            .map((line) => line.trim());
        const normalizedLines = lines.length > 0 ? lines : [stdin.trim()];

        for (let variantIndex = 0; variantIndex < 3; variantIndex += 1) {
            const nextLines = normalizedLines.map((line) =>
                mutateStdinLine(line, variantIndex),
            );
            const candidate = `${nextLines.join("\n")}\n`;
            if (candidate !== stdin) {
                candidates.add(candidate);
            }
        }
    }

    return [...candidates];
}

function isInvalidDraftFixturePath(path: string): boolean {
    return (
        !path ||
        path.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(path) ||
        path.includes("\\") ||
        path.split("/").some((segment) => !segment || segment === "." || segment === "..")
    );
}

function sanitizeDraftFixtureContent(content: string): string {
    const normalized = String(content ?? "")
        .replace(/\r\n?/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n");
    const lines = normalized.split("\n");

    while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
        lines.pop();
    }

    const trimmed = lines.join("\n");
    if (trimmed.length <= PYTHON_MAX_FIXTURE_CONTENT_LENGTH) {
        return trimmed;
    }

    const limited: string[] = [];
    let current = "";

    for (const line of lines) {
        const candidate = current ? `${current}\n${line}` : line;
        if (candidate.length > PYTHON_MAX_FIXTURE_CONTENT_LENGTH) break;
        limited.push(line);
        current = candidate;
    }

    return limited.length > 0
        ? limited.join("\n")
        : trimmed.slice(0, PYTHON_MAX_FIXTURE_CONTENT_LENGTH).trimEnd();
}


function normalizeDraftFixtureFiles(
    files: PythonCodeInputExercise["files"],
): DraftFixtureFile[] {
    if (!Array.isArray(files)) return [];

    return files
        .map((file) => {
            const path = typeof file.path === "string" ? file.path.trim() : "";
            if (!path) return null;
            return {
                path,
                content: String(file.content ?? ""),
                ...(typeof file.readOnly === "boolean" ? { readOnly: file.readOnly } : {}),
            };
        })
        .filter((file): file is DraftFixtureFile => Boolean(file));
}

function sanitizeDraftFixtureFiles(args: {
    files: PythonCodeInputExercise["files"];
    allowedPaths?: Set<string>;
}): FixtureSanitizationResult {
    const normalized = normalizeDraftFixtureFiles(args.files);
    const allowedPaths = args.allowedPaths;
    const seen = new Set<string>();
    const files: DraftFixtureFile[] = [];
    let removedInvalidPaths = 0;
    let removedUnreferencedPaths = 0;
    let normalizedContents = 0;
    let dedupedPaths = 0;

    for (const file of normalized) {
        if (isInvalidDraftFixturePath(file.path)) {
            removedInvalidPaths += 1;
            continue;
        }

        if (allowedPaths && allowedPaths.size > 0 && !allowedPaths.has(file.path)) {
            removedUnreferencedPaths += 1;
            continue;
        }

        if (seen.has(file.path)) {
            dedupedPaths += 1;
            continue;
        }
        seen.add(file.path);

        const sanitizedContent = sanitizeDraftFixtureContent(file.content);
        if (sanitizedContent !== file.content) {
            normalizedContents += 1;
        }

        files.push({
            ...file,
            content: sanitizedContent,
        });
    }

    return {
        files,
        changed:
            removedInvalidPaths > 0 ||
            removedUnreferencedPaths > 0 ||
            normalizedContents > 0 ||
            dedupedPaths > 0 ||
            files.length !== normalized.length,
        removedInvalidPaths,
        removedUnreferencedPaths,
        normalizedContents,
        dedupedPaths,
    };
}


function mergePythonFixtureFiles(
    baseFiles: PythonCodeInputExercise["files"],
    testFiles: PythonCodeInputExercise["files"],
): Array<{ path: string; content: string; readOnly?: boolean }> | undefined {
    const merged = new Map<
        string,
        { path: string; content: string; readOnly?: boolean }
    >();

    for (const file of normalizeDraftFixtureFiles(baseFiles)) {
        merged.set(file.path, file);
    }

    for (const file of normalizeDraftFixtureFiles(testFiles)) {
        merged.set(file.path, file);
    }

    return merged.size > 0 ? [...merged.values()] : undefined;
}
function normalizeTestFixtureKey(test: { files?: PythonCodeInputExercise["files"] }): string {
    const files = normalizeDraftFixtureFiles(test.files)
        .map((file) => `${file.path}\u0000${file.content}`)
        .sort();
    return files.join("\u0001");
}


function referencedReadFiles(source: string): string[] {
    const paths = new Set<string>();
    const pathVariables = new Map<string, string>();

    const openPattern =
        /\bopen\s*\(\s*["'`]([^"'`]+)["'`]\s*(?:,\s*["'`]([^"'`]*)["'`])?/g;

    const pathAssignmentPattern =
        /\b([A-Za-z_]\w*)\s*=\s*Path\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

    const pathOpenPattern =
        /\bPath\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*open\s*\(\s*(?:["'`]([^"'`]*)["'`])?/g;

    const variableOpenPattern =
        /\b([A-Za-z_]\w*)\s*\.\s*open\s*\(\s*(?:["'`]([^"'`]*)["'`])?/g;

    const pathReadTextPattern =
        /\bPath\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*read_text\s*\(/g;

    for (const match of source.matchAll(pathAssignmentPattern)) {
        const variableName = match[1]?.trim();
        const filePath = match[2]?.trim();
        if (!variableName || !filePath) continue;
        if (filePath.includes("{") || filePath.includes("$")) continue;
        pathVariables.set(variableName, filePath);
    }

    for (const match of source.matchAll(openPattern)) {
        if ((match.index ?? 0) > 0 && source[(match.index ?? 0) - 1] === ".") continue;
        const filePath = match[1]?.trim();
        const mode = (match[2] ?? "r").trim();

        if (!filePath) continue;
        if (filePath.includes("{") || filePath.includes("$")) continue;
        if (mode.includes("w") || mode.includes("a") || mode.includes("x")) continue;

        paths.add(filePath);
    }

    for (const match of source.matchAll(pathOpenPattern)) {
        const filePath = match[1]?.trim();
        const mode = (match[2] ?? "r").trim();

        if (!filePath) continue;
        if (filePath.includes("{") || filePath.includes("$")) continue;
        if (mode.includes("w") || mode.includes("a") || mode.includes("x")) continue;

        paths.add(filePath);
    }

    for (const match of source.matchAll(variableOpenPattern)) {
        const variableName = match[1]?.trim();
        const mode = (match[2] ?? "r").trim();
        if (!variableName) continue;
        if (mode.includes("w") || mode.includes("a") || mode.includes("x")) continue;

        const filePath = pathVariables.get(variableName);
        if (filePath) {
            paths.add(filePath);
        }
    }

    for (const match of source.matchAll(pathReadTextPattern)) {
        const filePath = match[1]?.trim();

        if (!filePath) continue;
        if (filePath.includes("{") || filePath.includes("$")) continue;

        paths.add(filePath);
    }

    return [...paths];
}

function ensureTrailingNewline(value: string): string {
    return value.endsWith("\n") ? value : `${value}\n`;
}

function inferFixtureContentFromTest(args: {
    exercise: PythonCodeInputExercise;
    filePath: string;
    test: { stdout?: string };
    index: number;
}): string {
    const source = String(args.exercise.solutionCode ?? "");
    const stdout = String(args.test.stdout ?? "");
    const trimmedStdout = stdout.trimEnd();

    const readAssignmentMatch = source.match(
        /\b([A-Za-z_]\w*)\s*=\s*[A-Za-z_]\w*\.read\s*\(\s*\)/,
    );
    const readlineAssignmentMatch = source.match(
        /\b([A-Za-z_]\w*)\s*=\s*[A-Za-z_]\w*\.readline\s*\(\s*\)/,
    );
    const readlinesAssignmentMatch = source.match(
        /\b([A-Za-z_]\w*)\s*=\s*[A-Za-z_]\w*\.readlines\s*\(\s*\)/,
    );

    if (/print\s*\(\s*\w+\.read\s*\(\s*\)\s*,\s*end\s*=\s*["'`]["'`]\s*\)/.test(source)) {
        return stdout;
    }

    if (
        readAssignmentMatch?.[1] &&
        new RegExp(
            `print\\s*\\(\\s*${readAssignmentMatch[1]}\\s*,\\s*end\\s*=\\s*["'\`]["'\`]\\s*\\)`,
        ).test(source)
    ) {
        return stdout;
    }

    if (/print\s*\(\s*\w+\.read\s*\(\s*\)\s*\)/.test(source)) {
        return stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout;
    }

    if (
        readAssignmentMatch?.[1] &&
        new RegExp(`print\\s*\\(\\s*${readAssignmentMatch[1]}\\s*\\)`).test(source)
    ) {
        return stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout;
    }

    if (/Path\s*\(\s*["'`][^"'`]+["'`]\s*\)\s*\.\s*read_text\s*\(/.test(source)) {
        if (trimmedStdout.length > 0) {
            return stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout;
        }
    }

    if (/readline\s*\(\s*\)\.strip\s*\(\s*\)/.test(source)) {
        const firstLine = trimmedStdout || "First line";
        return `${firstLine}\nSecond line\n`;
    }

    if (
        readlineAssignmentMatch?.[1] &&
        new RegExp(`print\\s*\\(\\s*${readlineAssignmentMatch[1]}\\s*\\)`).test(source)
    ) {
        return ensureTrailingNewline(trimmedStdout || "First line");
    }

    if (
        /\bfor\s+\w+\s+in\s+\w+\s*:\s*\n[\s\S]*?\b[A-Za-z_]\w*\s*\+=\s*1/m.test(source) ||
        /\blen\s*\(\s*\w+\.readlines\s*\(\s*\)\s*\)/.test(source) ||
        (
            Boolean(readlinesAssignmentMatch?.[1]) &&
            new RegExp(`len\\s*\\(\\s*${readlinesAssignmentMatch?.[1]}\\s*\\)`).test(source)
        )
    ) {
        const count = Number(trimmedStdout);

        if (Number.isInteger(count) && count >= 0 && count <= 20) {
            return Array.from({ length: count }, (_, lineIndex) => `line ${lineIndex + 1}`).join("\n") +
                (count > 0 ? "\n" : "");
        }
    }

    const containsMatch = source.match(
        /\bif\s+["'`]([^"'`]+)["'`]\s+in\s+line\s*:\s*\n[\s\S]*?\bprint\s*\(\s*line\.strip\s*\(\s*\)\s*\)/m,
    );

    if (containsMatch?.[1]) {
        const requiredText = containsMatch[1];
        const lines = trimmedStdout
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length > 0 && lines.every((line) => line.includes(requiredText))) {
            return ["Other line", ...lines].join("\n") + "\n";
        }
    }

    if (
        /\bfor\s+line\s+in\s+\w+\s*:\s*\n[\s\S]*?\bprint\s*\(\s*line\.strip\s*\(\s*\)\s*\)/m.test(source)
    ) {
        const lines = trimmedStdout
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length > 0) {
            return `${lines.join("\n")}\n`;
        }
    }

    if (
        /\bfor\s+\w+\s+in\s+\w+/.test(source) &&
        /\.strip\s*\(\s*\)/.test(source) &&
        /\bif\s+\w+\s*!=\s*["'`]["'`]\s*:/.test(source) &&
        /\bprint\s*\(\s*\w+\s*\)/.test(source)
    ) {
        const lines = trimmedStdout
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length > 0) {
            return lines
                .map((line, lineIndex) => (lineIndex % 2 === 0 ? `  ${line}  ` : line))
                .join("\n\n") + "\n";
        }
    }

    if (trimmedStdout.length > 0) {
        return ensureTrailingNewline(trimmedStdout);
    }

    return args.index % 2 === 0
        ? "apple\nbanana\ncarrot\n"
        : "red\nblue\ngreen\n";
}

function sanitizePythonExerciseFixtures(
    exercise: PythonCodeInputExercise,
): {
    changed: boolean;
    exercise: PythonCodeInputExercise;
    removedInvalidPaths: number;
    removedUnreferencedPaths: number;
    normalizedContents: number;
    dedupedPaths: number;
} {
    const filePaths = referencedReadFiles(String(exercise.solutionCode ?? ""));
    const allowedPaths = filePaths.length > 0 ? new Set(filePaths) : undefined;
    const exerciseFiles = sanitizeDraftFixtureFiles({
        files: exercise.files,
        allowedPaths,
    });
    const tests = Array.isArray(exercise.tests)
        ? exercise.tests.map((test) => ({ ...test }))
        : [];

    let removedInvalidPaths = exerciseFiles.removedInvalidPaths;
    let removedUnreferencedPaths = exerciseFiles.removedUnreferencedPaths;
    let normalizedContents = exerciseFiles.normalizedContents;
    let dedupedPaths = exerciseFiles.dedupedPaths;
    let changed = exerciseFiles.changed;

    const sanitizedTests = tests.map((test) => {
        const sanitized = sanitizeDraftFixtureFiles({
            files: test.files,
            allowedPaths,
        });
        removedInvalidPaths += sanitized.removedInvalidPaths;
        removedUnreferencedPaths += sanitized.removedUnreferencedPaths;
        normalizedContents += sanitized.normalizedContents;
        dedupedPaths += sanitized.dedupedPaths;
        changed = changed || sanitized.changed;

        if (sanitized.files.length > 0) {
            return {
                ...test,
                files: sanitized.files,
            };
        }

        if (typeof test.files === "undefined") {
            return test;
        }

        const nextTest = { ...test } as typeof test & { files?: typeof test.files };
        delete nextTest.files;
        return nextTest;
    });

    const nextExercise = {
        ...exercise,
        tests: sanitizedTests,
    } as PythonCodeInputExercise & { files?: PythonCodeInputExercise["files"] };

    if (exerciseFiles.files.length > 0) {
        nextExercise.files = exerciseFiles.files;
    } else {
        delete nextExercise.files;
    }

    return {
        changed,
        exercise: nextExercise,
        removedInvalidPaths,
        removedUnreferencedPaths,
        normalizedContents,
        dedupedPaths,
    };
}

function repairPythonFileFixtures(
    exercise: PythonCodeInputExercise,
): FileFixtureRepairResult {
    if ((exercise.recipeType ?? "fixed_tests") !== "fixed_tests") {
        return { changed: false };
    }

    const tests = Array.isArray(exercise.tests)
        ? exercise.tests.map((test) => ({ ...test }))
        : [];

    if (tests.length < 1) return { changed: false };

    const filePaths = referencedReadFiles(String(exercise.solutionCode ?? ""));
    if (filePaths.length < 1) return { changed: false };

    let changed = false;
    let addedTestFixtures = 0;
    let alignedTests = false;

    for (let testIndex = 0; testIndex < tests.length; testIndex += 1) {
        const test = tests[testIndex]!;
        const existingFiles = normalizeDraftFixtureFiles(test.files);
        const nextFiles = [...existingFiles];

        for (const filePath of filePaths) {
            const hasTargetFile = nextFiles.some((file) => file.path === filePath);
            if (hasTargetFile) continue;

            nextFiles.push({
                path: filePath,
                content: inferFixtureContentFromTest({
                    exercise,
                    filePath,
                    test,
                    index: testIndex,
                }),
                readOnly: true,
            });

            addedTestFixtures += 1;
            changed = true;
        }

        if (nextFiles.length !== existingFiles.length) {
            test.files = nextFiles;
        }
    }

    let files = normalizeDraftFixtureFiles(exercise.files);
    let addedExerciseFixture = false;

    for (const filePath of filePaths) {
        const hasExerciseFixture = files.some((file) => file.path === filePath);
        if (hasExerciseFixture) continue;

        const fallbackTest = tests.find((test) =>
            normalizeDraftFixtureFiles(test.files).some((file) => file.path === filePath),
        );

        const fallbackFixture = normalizeDraftFixtureFiles(fallbackTest?.files).find(
            (file) => file.path === filePath,
        );

        if (!fallbackFixture) continue;

        files = [...files, fallbackFixture];
        addedExerciseFixture = true;
        changed = true;
    }

    const fixtureKeys = new Set(tests.map((test) => normalizeTestFixtureKey(test)));
    alignedTests = fixtureKeys.size >= 1;

    if (!changed) {
        return { changed: false };
    }

    return {
        changed: true,
        exercise: {
            ...exercise,
            files,
            tests,
        },
        addedExerciseFixture,
        addedTestFixtures,
        alignedTests,
    };
}
function looksLikeCsvContent(content: string): boolean {
    const lines = String(content ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    return lines.length >= 2 && lines[0]!.includes(",");
}

function buildAlternateCsvContents(content: string): string[] {
    const lines = String(content ?? "")
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);

    const header = lines[0] ?? "";

    if (!header.includes(",")) {
        return [];
    }

    const lowerHeader = header.toLowerCase();
    const candidates: string[] = [];

    if (/\bname\b/.test(lowerHeader) && /\bscore\b/.test(lowerHeader)) {
        candidates.push(
            `${header}\nMia,3\nOmar,11\n`,
            `${header}\n Zoe , 10 \n Max , 2 \n`,
            `${header}\nLia,8\nNoah,ten\n`,
            `${header}\nAva,5\nBen,7\nKai,bad\n`,
        );
    }

    if (/\bname\b/.test(lowerHeader) && candidates.length < 1) {
        candidates.push(
            `${header}\nMia\nOmar\n`,
            `${header}\n Zoe \n Max \n`,
        );
    }

    if (candidates.length < 1) {
        candidates.push(
            `${header}\nalpha,beta\none,two\n`,
            `${header}\nred,4\nblue,6\n`,
        );
    }

    return candidates.filter((candidate) => candidate.trim() !== String(content ?? "").trim());
}

function buildAlternateTextFixtureContents(content: string): string[] {
    const normalized = String(content ?? "").replace(/\r\n?/g, "\n");

    if (looksLikeCsvContent(normalized)) {
        return buildAlternateCsvContents(normalized);
    }

    return [
        "Ava\nBen\nKai\n",
        "10\n20\nbad\n",
        " apple \n banana \n",
    ].filter((candidate) => candidate.trim() !== normalized.trim());
}

async function repairThinFileFixtureFixedTests(
    exercise: PythonCodeInputExercise,
): Promise<ThinFixedTestRepairResult> {
    if ((exercise.recipeType ?? "fixed_tests") !== "fixed_tests") {
        return { status: "unchanged" };
    }

    const tests = Array.isArray(exercise.tests) ? [...exercise.tests] : [];

    if (new Set(tests.map((test) => normalizeFixedTestKey(test))).size >= PYTHON_MINIMUM_FIXED_TESTS) {
        return { status: "unchanged" };
    }

    const solutionCode = String(exercise.solutionCode ?? "").trim();
    if (!solutionCode) {
        return { status: "unchanged" };
    }

    const readFiles = referencedReadFiles(solutionCode);
    if (readFiles.length < 1) {
        return { status: "unchanged" };
    }

    const baseTest = tests[0];
    if (!baseTest) {
        return { status: "unchanged" };
    }

    // This repair is only for file-fixture tests, not stdin tests.
    if (String(baseTest.stdin ?? "").trim().length > 0) {
        return { status: "unchanged" };
    }

    const baseFiles = mergePythonFixtureFiles(exercise.files, baseTest.files);
    if (!baseFiles || baseFiles.length < 1) {
        return { status: "unchanged" };
    }

    const runner = getCodeRunner() ?? runLocalCode;
    const seenKeys = new Set(tests.map((test) => normalizeFixedTestKey(test)));
    const seenStdout = new Set(tests.map((test) => String(test.stdout ?? "").trimEnd()));

    for (const filePath of readFiles) {
        const baseFile = baseFiles.find((file) => file.path === filePath);
        if (!baseFile) continue;

        const candidateContents = buildAlternateTextFixtureContents(baseFile.content);

        for (const content of candidateContents) {
            const candidateFiles = baseFiles.map((file) =>
                file.path === filePath
                    ? {
                        ...file,
                        content,
                        readOnly: file.readOnly ?? true,
                    }
                    : file,
            );

            const run = await runner({
                language: "python",
                code: solutionCode,
                stdin: "",
                files: candidateFiles,
                limits: { timeoutMs: 4000 },
            });

            if (!run.ok) continue;

            const stdout = String(run.stdout ?? "").trimEnd();
            if (!stdout.trim()) continue;
            if (seenStdout.has(stdout)) continue;

            const nextTest = {
                stdin: "",
                stdout: `${stdout}\n`,
                match: "exact" as const,
                files: candidateFiles,
            };

            const key = normalizeFixedTestKey(nextTest);
            if (seenKeys.has(key)) continue;

            tests.push(nextTest);
            seenKeys.add(key);
            seenStdout.add(stdout);

            if (seenKeys.size >= PYTHON_MINIMUM_FIXED_TESTS) {
                return {
                    status: "repaired",
                    exercise: {
                        ...exercise,
                        recipeType: "fixed_tests",
                        tests,
                    },
                    addedCount: tests.length - (exercise.tests?.length ?? 0),
                };
            }
        }
    }

    return { status: "unchanged" };
}

async function repairThinFixedTests(
    exercise: PythonCodeInputExercise,
): Promise<ThinFixedTestRepairResult> {
    if ((exercise.recipeType ?? "fixed_tests") !== "fixed_tests") {
        return { status: "unchanged" };
    }

    const tests = Array.isArray(exercise.tests) ? [...exercise.tests] : [];
    if (new Set(tests.map((test) => normalizeFixedTestKey(test))).size >= PYTHON_MINIMUM_FIXED_TESTS) {
        return { status: "unchanged" };
    }

    if (!hasInputCalls(exercise)) {
        return {
            status: "unsafe",
            reason:
                "This fixed_tests exercise does not read stdin, so the repair step cannot safely invent a second meaningful test without faking duplicate coverage.",
        };
    }

    const solutionCode = String(exercise.solutionCode ?? "").trim();
    if (!solutionCode) {
        return {
            status: "unsafe",
            reason: "This fixed_tests exercise has no runnable solutionCode for deriving an additional test.",
        };
    }

    const runner = getCodeRunner() ?? runLocalCode;
    const seenKeys = new Set(tests.map((test) => normalizeFixedTestKey(test)));
    const seenStdout = new Set(tests.map((test) => String(test.stdout ?? "").trimEnd()));
    const candidates = buildAlternateStdinCandidates(exercise);

    for (const stdin of candidates) {
        const run = await runner({
            language: "python",
            code: solutionCode,
            stdin,
            limits: { timeoutMs: 4000 },
        });

        if (!run.ok) continue;

        const stdout = String(run.stdout ?? "");
        if (!stdout.trim()) continue;
        if (seenStdout.has(stdout.trimEnd())) continue;

        const nextTest = {
            stdin,
            stdout,
            match: "exact" as const,
        };
        const nextKey = normalizeFixedTestKey(nextTest);

        if (seenKeys.has(nextKey)) continue;

        tests.push(nextTest);
        seenKeys.add(nextKey);
        seenStdout.add(stdout.trimEnd());

        if (new Set(tests.map((test) => normalizeFixedTestKey(test))).size >= PYTHON_MINIMUM_FIXED_TESTS) {
            return {
                status: "repaired",
                exercise: {
                    ...exercise,
                    recipeType: "fixed_tests",
                    tests,
                },
                addedCount: tests.length - (exercise.tests?.length ?? 0),
            };
        }
    }

    return {
        status: "unsafe",
        reason:
            "The repair step could not derive a second distinct stdin/stdout case from the current Python prompt and solution. Replace this with a non-code exercise or rewrite it as a stdin-based task with variable behavior.",
    };
}

function buildStaticOutputDistractors(correctOutput: string): string[] {
    const trimmed = correctOutput.trimEnd();

    if (/^-?\d+$/.test(trimmed)) {
        const value = Number(trimmed);
        return [String(value + 1), String(value - 1), `${trimmed}${trimmed}`];
    }

    if (/^[A-Za-z ,!?.'-]+$/.test(trimmed) && trimmed.length > 0) {
        return [
            trimmed.replace(/[!?.]+$/, ""),
            "No output",
            "SyntaxError",
        ];
    }

    return ["No output", "SyntaxError", "A different value"];
}

function dedupeOptions(options: string[]) {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const option of options) {
        const key = option.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(option);
    }

    return out;
}

function convertStaticCommentExercise(
    exercise: PythonCodeInputExercise,
): PythonDraftExercise {
    const commentLine =
        String(exercise.solutionCode ?? "")
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line.startsWith("#")) ?? "# This is a comment";

    return {
        id: exercise.id,
        kind: "single_choice",
        title: "Identify the Python comment",
        prompt:
            "Which line is a Python comment and is ignored when the program runs?\n\n```python\n# This prints a message\nprint(\"Learning Python is fun!\")\n```",
        options: [
            commentLine,
            "print(\"Learning Python is fun!\")",
            "Learning Python is fun!",
            "Click Run",
        ],
        correctOptionIds: ["a"],
        hint: "Comments start with # and help explain code to readers.",
        help: {
            concept:
                "A Python comment starts with # and is ignored during execution.",
            hint_1:
                "Look for the line that explains the code instead of running it.",
            hint_2:
                "The correct answer begins with the comment marker used in Python.",
        },
    };
}




function isOriginalSingleStaticOutputFixedTest(
    exercise: PythonCodeInputExercise,
): boolean {
    if ((exercise.recipeType ?? "fixed_tests") !== "fixed_tests") return false;
    if (hasInputCalls(exercise)) return false;

    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length !== 1) return false;

    const onlyTest = tests[0];
    if (!onlyTest) return false;

    if (String(onlyTest.stdin ?? "").trim().length > 0) return false;
    if (Array.isArray(onlyTest.files) && onlyTest.files.length > 0) return false;
    if (Array.isArray(exercise.files) && exercise.files.length > 0) return false;

    const stdout = String(onlyTest.stdout ?? "").trim();
    if (!stdout) return false;

    // Placeholder/narrative tests are repairable. Do not convert them to concept questions.
    if (looksLikePlaceholderStdout(stdout)) return false;

    const normalizedStdout = stdout.toLowerCase();

    // Boolean placeholders are also repairable by the existing OOP/list repair passes.
    if (normalizedStdout === "true" || normalizedStdout === "false") {
        return false;
    }

    const solutionCode = String(exercise.solutionCode ?? "");

    // A static-output tracing conversion only makes sense when the original program
    // already prints something. No-output OOP/list exercises have dedicated repair passes.
    if (!/\bprint\s*\(/.test(solutionCode)) return false;

    // Some generated OOP tasks print a getter before defining it. Those should be repaired
    // by rewriteMissingOopSupportMethods(), not converted into single_choice.
    if (
        /\.get_balance\s*\(/.test(solutionCode) &&
        !/^    def\s+get_balance\b/m.test(solutionCode) &&
        /self\.__balance\b/.test(solutionCode)
    ) {
        return false;
    }

    return true;
}



function convertStaticOutputExercise(
    exercise: PythonCodeInputExercise,
): PythonDraftExercise | null {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length < 1) return null;
    if (hasInputCalls(exercise)) return null;

    const hasNonEmptyStdin = tests.some((test) =>
        String(test.stdin ?? "").trim().length > 0,
    );
    if (hasNonEmptyStdin) return null;

    const hasFileFixtures =
        (Array.isArray(exercise.files) && exercise.files.length > 0) ||
        tests.some((test) => Array.isArray(test.files) && test.files.length > 0);

    // File I/O tasks should be repaired with distinct file fixtures, not converted
    // into concept-only questions.
    if (hasFileFixtures) return null;

    const stdout = String(tests[0]?.stdout ?? "");
    if (!stdout.trim()) return null;

    const code = String(exercise.solutionCode ?? "").trim();
    if (!code) return null;

    const haystack = `${exercise.title} ${exercise.prompt} ${exercise.solutionCode}`.toLowerCase();

    const simpleCodeLines = code
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));

    const hasClassOrFunctionDefinition =
        /\bclass\s+[A-Za-z_]\w*\b|^def\s+[A-Za-z_]\w*\s*\(/m.test(code);

    const hasPrintedOutput = /\bprint\s*\(/.test(code);

    const looksLikeTinyPrintExercise =
        !hasClassOrFunctionDefinition &&
        simpleCodeLines.length <= 2 &&
        /\b(print|output|comment|calculate|message|name)\b/.test(haystack);

    const looksLikeNoInputOopDemo =
        hasClassOrFunctionDefinition &&
        hasPrintedOutput &&
        simpleCodeLines.length <= 18 &&
        /\b(class|object|instance|attribute|method|responsibility|encapsulation)\b/.test(
            haystack,
        );

    const looksLikeStaticOutput =
        looksLikeTinyPrintExercise || looksLikeNoInputOopDemo;

    if (!looksLikeStaticOutput) return null;

    if (!hasClassOrFunctionDefinition && /\bcomment\b/.test(haystack)) {
        return convertStaticCommentExercise(exercise);
    }

    const trimmedOutput = stdout.trimEnd();
    const options = dedupeOptions([
        trimmedOutput,
        ...buildStaticOutputDistractors(trimmedOutput),
    ]).slice(0, 4);

    while (options.length < 4) {
        options.push(`Different output ${options.length + 1}`);
    }

    const promptIntro = looksLikeNoInputOopDemo
        ? "A learner already wrote this no-input object-oriented program. What does it print?"
        : "What is the output of this Python code?";

    return {
        id: exercise.id,
        kind: "single_choice",
        title: exercise.title,
        prompt: `${promptIntro}\n\n\`\`\`python\n${code}\n\`\`\``,
        options,
        correctOptionIds: ["a"],
        hint: "Trace the code until you reach the print statement.",
        help: {
            concept:
                "A hardcoded no-input program always prints the same result, so it is better checked as a tracing question than as a code_input with fake duplicate tests.",
            hint_1:
                "Follow the object or variable changes before the final print call.",
            hint_2:
                "Choose the option that exactly matches the printed output.",
        },
    };
}

function hasFunctionWrapper(source: unknown): boolean {
    return /\b_inputs\s*=\s*\[\]/.test(String(source ?? "")) &&
        /\b_parse_arg\b/.test(String(source ?? ""));
}

function appendSafeMissingFunctionInputs(args: {
    stdin: string;
    missingCount: number;
}): string {
    const lines = args.stdin
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    for (let index = 0; index < args.missingCount; index += 1) {
        // Use 1 as a safe default:
        // - avoids division by zero
        // - works with int(...)
        // - works with arithmetic examples
        lines.push("1");
    }

    return `${lines.join("\n")}\n`;
}

function repairFunctionWrapperTestsWithMissingInputs(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    if (!hasFunctionWrapper(exercise.solutionCode)) return null;

    const signature = extractFunctionSignature(exercise);
    if (!signature || signature.params.length < 2) return null;

    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length < 1) return null;

    let changed = false;

    const nextTests = tests.map((test) => {
        const existingCount = countNonEmptyStdinLines(test.stdin);
        const missingCount = signature.params.length - existingCount;

        if (missingCount <= 0) return test;

        changed = true;

        return {
            ...test,
            stdin: appendSafeMissingFunctionInputs({
                stdin: String(test.stdin ?? ""),
                missingCount,
            }),
        };
    });

    if (!changed) return null;

    return {
        ...exercise,
        tests: nextTests,
    };
}



function buildTopicAwareDragReorderFallback(
    seed: TopicSeed,
    id: string,
): PythonDraftExercise {
    const tokens = [
        "Write a small piece of Python code",
        "Run the code",
        "Read the output or error message",
    ];

    return {
        id,
        kind: "drag_reorder",
        title: "Order the run-and-check workflow",
        prompt: `Put the steps in order for practicing "${seed.title}".`,
        tokens,
        correctOrder: tokens,
        hint: "You need code before you can run it.",
        help: {
            concept: "A basic Python workflow is write code, run it, then inspect the result.",
            hint_1: "The output appears after running.",
            hint_2: "Errors are also useful feedback.",
        },
    };
}
function buildPolicyFallbackExercise(args: {
    seed: TopicSeed;
    kind: PythonPolicyExerciseKind;
    index: number;
}): PythonDraftExercise {
    const id = `policy_${args.kind}_${args.index}`;

    switch (args.kind) {
        case "single_choice":
            return buildTopicAwareSingleChoiceFallback(args.seed, id);

        case "multi_choice":
            return buildTopicAwareMultiChoiceFallback(args.seed, id);

        case "drag_reorder":
            return buildTopicAwareDragReorderFallback(args.seed, id);

        case "fill_blank_choice":
            if (looksLikeConditionalTopic(args.seed)) {
                return buildConditionalFillBlankExercise(id);
            }
            return buildGenericFillBlankExercise(id);

        case "code_input":
            if (looksLikeTruthinessTopic(args.seed)) {
                return buildTruthinessCodeInputExercise(id, args.index);
            }
            return buildGenericCodeInputExercise(id, args.index);
    }
}
function appendPolicyFallbackExercisesForAllKinds(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    report: RepairReport;
}): TopicAuthoringDraft {
    if (
        args.seed.sectionRole === "module_project" ||
        args.seed.sectionRole === "capstone" ||
        (Array.isArray(args.draft.projectDraft?.stepIds) && args.draft.projectDraft.stepIds.length > 0)
    ) {
        return args.draft;
    }

    const planned = args.seed.plannedExerciseCounts;
    if (!planned) return args.draft;

    const counts = countKinds(args.draft);
    const quizDraft = [...args.draft.quizDraft];
    const signatures = new Set(
        quizDraft.map((exercise) => normalizePolicyExerciseSignature(exercise)),
    );

    for (const kind of PYTHON_POLICY_EXERCISE_KINDS) {
        const target = planned.counts[kind] ?? 0;
        let index = 1;
        let guard = 0;

        while (counts[kind] < target) {
            const exercise = buildPolicyFallbackExercise({
                seed: args.seed,
                kind,
                index,
            });
            const signature = normalizePolicyExerciseSignature(exercise);
            index += 1;
            guard += 1;

            if (signatures.has(signature)) {
                args.report.repairs.push({
                    code: "PYTHON_DUPLICATE_POLICY_CODE_INPUT_SKIPPED",
                    category: "other",
                    severity: "low",
                    field: exercise.id,
                    message: `Skipped a duplicate synthesized ${kind} exercise while satisfying the planned exercise mix for "${args.seed.topicId}".`,
                });

                if (guard > target + 10) {
                    break;
                }
                continue;
            }

            quizDraft.push(exercise);
            signatures.add(signature);
            counts[kind] += 1;

            args.report.repairs.push({
                code: "PYTHON_POLICY_EXERCISE_SYNTHESIZED",
                category: "other",
                severity: "medium",
                field: exercise.id,
                message: `Added a fallback ${kind} exercise to satisfy the planned exercise mix for "${args.seed.topicId}".`,
            });
        }
    }

    return {
        ...args.draft,
        quizDraft,
    };
}
const PYTHON_POLICY_EXERCISE_KINDS = [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "code_input",
] as const;

type PythonPolicyExerciseKind = (typeof PYTHON_POLICY_EXERCISE_KINDS)[number];

function normalizePolicyExerciseSignature(exercise: PythonDraftExercise): string {
    switch (exercise.kind) {
        case "code_input":
            return JSON.stringify({
                kind: exercise.kind,
                prompt: String(exercise.prompt ?? "").trim().toLowerCase(),
                recipeType: exercise.recipeType ?? null,
                tests: (exercise.tests ?? []).map((test) => ({
                    stdin: String(test.stdin ?? ""),
                    stdout: String(test.stdout ?? ""),
                    match: test.match ?? "exact",
                })),
            });
        case "single_choice":
        case "multi_choice":
            return JSON.stringify({
                kind: exercise.kind,
                prompt: String(exercise.prompt ?? "").trim().toLowerCase(),
                options: exercise.options ?? [],
                correctOptionIds: exercise.correctOptionIds ?? [],
            });
        case "drag_reorder":
            return JSON.stringify({
                kind: exercise.kind,
                prompt: String(exercise.prompt ?? "").trim().toLowerCase(),
                tokens: exercise.tokens ?? [],
                correctOrder: exercise.correctOrder ?? [],
            });
        case "fill_blank_choice":
            return JSON.stringify({
                kind: exercise.kind,
                prompt: String(exercise.prompt ?? "").trim().toLowerCase(),
                template: exercise.template ?? "",
                choices: exercise.choices ?? [],
                correctValue: exercise.correctValue ?? "",
            });
    }
}

function normalizePolicyExerciseCounts(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    report: RepairReport;
}): TopicAuthoringDraft {
    const planned = args.seed.plannedExerciseCounts;
    if (!planned) return args.draft;

    const keptCounts: Record<PythonPolicyExerciseKind, number> = {
        single_choice: 0,
        multi_choice: 0,
        drag_reorder: 0,
        fill_blank_choice: 0,
        code_input: 0,
    };

    const quizDraft: TopicAuthoringDraft["quizDraft"] = [];

    for (const exercise of args.draft.quizDraft) {
        const kind = exercise.kind as PythonPolicyExerciseKind;
        const target = planned.counts[kind] ?? 0;

        if (keptCounts[kind] < target) {
            quizDraft.push(exercise);
            keptCounts[kind] += 1;
            continue;
        }

        args.report.repairs.push({
            code: "PYTHON_POLICY_EXTRA_EXERCISE_DROPPED",
            category: "other",
            severity: "medium",
            field: exercise.id,
            message: `Dropped extra ${kind} exercise to satisfy the planned exercise mix for "${args.seed.topicId}".`,
        });
    }

    const nextDraft: TopicAuthoringDraft = {
        ...args.draft,
        quizDraft,
    };

    return appendPolicyFallbackExercisesForAllKinds({
        seed: args.seed,
        draft: nextDraft,
        report: args.report,
    });
}


function appendPolicyFallbackExercises(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    report: RepairReport;
}): TopicAuthoringDraft {
    const planned = args.seed.plannedExerciseCounts;
    if (!planned) return args.draft;

    const counts = countKinds(args.draft);
    const nextExercises = [...args.draft.quizDraft];

    let fillBlankIndex = 1;
    let codeInputIndex = 1;

    while (counts.fill_blank_choice < (planned.counts.fill_blank_choice ?? 0)) {
        const exercise = buildFallbackExercise({
            seed: args.seed,
            kind: "fill_blank_choice",
            index: fillBlankIndex,
        });
        fillBlankIndex += 1;
        nextExercises.push(exercise);
        counts.fill_blank_choice += 1;
        args.report.repairs.push({
            code: "PYTHON_POLICY_FILL_BLANK_SYNTHESIZED",
            category: "other",
            severity: "medium",
            field: exercise.id,
            message:
                `Added a fallback fill_blank_choice exercise to satisfy the planned exercise mix for "${args.seed.topicId}".`,
        });
    }

    while (counts.code_input < (planned.counts.code_input ?? 0)) {
        const exercise = buildFallbackExercise({
            seed: args.seed,
            kind: "code_input",
            index: codeInputIndex,
        });
        codeInputIndex += 1;
        nextExercises.push(exercise);
        counts.code_input += 1;
        args.report.repairs.push({
            code: "PYTHON_POLICY_CODE_INPUT_SYNTHESIZED",
            category: "other",
            severity: "medium",
            field: exercise.id,
            message:
                `Added a fallback code_input exercise to satisfy the planned exercise mix for "${args.seed.topicId}".`,
        });
    }

    return {
        ...args.draft,
        quizDraft: nextExercises,
    };
}

export async function repairPythonDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<{
    draft: TopicAuthoringDraft;
    report: RepairReport;
}> {
    const report = makeEmptyRepairReport(args.seed.topicId);

    let nextDraft: TopicAuthoringDraft = {
        ...args.draft,
        sketchBlocks: args.draft.sketchBlocks.map((block) => {
            const originalBodyMarkdown = String(block.bodyMarkdown ?? "");
            const tracebackRepair =
                rewriteBrowserSafeTracebackText(originalBodyMarkdown);

            let bodyMarkdown = tracebackRepair.next;

            if (tracebackRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_BROWSER_TRACEBACK_FILENAME_REMOVED",
                    category: "text",
                    severity: "medium",
                    field: `sketchBlocks.${block.id}.bodyMarkdown`,
                    message:
                        "Replaced .py filename traceback wording with browser code editor wording.",
                });
            }

            if (
                hasMultilineCodeFence(bodyMarkdown) &&
                !hasLineByLineExplanation(bodyMarkdown)
            ) {
                report.repairs.push({
                    code: "PYTHON_SKETCH_LINE_BY_LINE_EXPLANATION_ADDED",
                    category: "text",
                    severity: "medium",
                    field: `sketchBlocks.${block.id}.bodyMarkdown`,
                    message:
                        "Added a short line-by-line explanation after a multi-line code example.",
                });

                bodyMarkdown = `${bodyMarkdown}\n\nLine by line: read each statement from top to bottom. Notice which names are created, which values are passed into functions, and what output the code is meant to show.`;
            }

            if (bodyMarkdown === originalBodyMarkdown) return block;

            return {
                ...block,
                bodyMarkdown,
            };
        }),
        quizDraft: await Promise.all(args.draft.quizDraft.map(async (exercise) => {
            if (exercise.kind !== "code_input") return exercise;

            const semanticTestRepair = stripFixedTestsFromSemanticCodeExercise(exercise);

            if (semanticTestRepair.removedCount > 0) {
                report.repairs.push({
                    code: "PYTHON_SEMANTIC_STDOUT_TESTS_REMOVED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        `Removed ${semanticTestRepair.removedCount} fixed stdout test(s) from a semantic Python code_input exercise. Semantic exercises must be graded by semanticChecks[] only.`,
                });
            }

            const fixedOopSemanticRepair = convertOopFixedTestsToSemantic(
                semanticTestRepair.exercise,
            );

            if (fixedOopSemanticRepair) {
                report.repairs.push({
                    code: "PYTHON_OOP_FIXED_TESTS_CONVERTED_TO_SEMANTIC",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Converted an OOP/class multifile fixed_tests exercise into semantic checks so the critique gate validates structure instead of one stdout fixture.",
                });
            }

            const semanticWorkspaceRepair = promoteSemanticOopFilesToWorkspaceFiles(
                fixedOopSemanticRepair ?? semanticTestRepair.exercise,
            );

            if (semanticWorkspaceRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_SEMANTIC_OOP_FILES_PROMOTED_TO_WORKSPACE",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Promoted generated Python code files into starterFiles/solutionFiles so semantic OOP checks run against the full multifile workspace.",
                });
            }

            const synthesizedWorkspaceRepair = synthesizeSemanticOopWorkspaceFiles(
                semanticWorkspaceRepair.exercise,
            );

            if (synthesizedWorkspaceRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_SEMANTIC_OOP_WORKSPACE_SYNTHESIZED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Synthesized starterFiles/solutionFiles for a semantic OOP workspace when the generated draft only supplied a thin entry file.",
                });
            }

            const completedEntrySolutionRepair =
                synthesizeEntrySolutionForSemanticOopExercise(synthesizedWorkspaceRepair.exercise);

            if (completedEntrySolutionRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_SEMANTIC_OOP_ENTRY_SOLUTION_SYNTHESIZED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Synthesized a complete runnable entry-file solution from semantic OOP checks when the generated main file only contained imports, comments, or placeholders.",
                });
            }

            const statefulSemanticRepair = repairStatefulSemanticMethodReturns(
                completedEntrySolutionRepair.exercise,
            );

            if (statefulSemanticRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_STATEFUL_SEMANTIC_METHOD_SEQUENCE_ADDED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Converted getter-only method_returns checks into method_sequence_returns checks so state-changing OOP methods are called before the final getter is validated.",
                });
            }

            const completedClassFileRepair = completeSemanticOopSolutionClassFiles(
                statefulSemanticRepair.exercise,
            );

            if (completedClassFileRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_SEMANTIC_OOP_CLASS_FILES_COMPLETED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Completed class implementation files from semantic OOP checks when generated model files still contained starter comments or empty method bodies.",
                });
            }

            const completedFunctionFileRepair = completeSemanticFunctionSolutionFiles(
                completedClassFileRepair.exercise,
            );

            if (completedFunctionFileRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_SEMANTIC_FUNCTION_FILES_COMPLETED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Completed helper function implementation files from function_returns semantic checks when generated solution files still contained starter comments or pass statements.",
                });
            }

            const syncedWorkspaceSurfaces = syncSemanticWorkspaceEntrySurface(
                completedFunctionFileRepair.exercise,
            );

            if (syncedWorkspaceSurfaces.changed) {
                report.repairs.push({
                    code: "PYTHON_SEMANTIC_WORKSPACE_SURFACES_SYNCED",
                    category: "recipe",
                    severity: "medium",
                    field: exercise.id,
                    message:
                        "Synced the solved entry file back into starterCode/solutionCode after workspace-file repairs.",
                });
            }

            const semanticRunnableProjectRepair =
                await convertSemanticRunnableProjectToFixedTests(syncedWorkspaceSurfaces.exercise);

            if (semanticRunnableProjectRepair) {
                report.repairs.push({
                    code: "PYTHON_SEMANTIC_RUNNABLE_PROJECT_CONVERTED_TO_FIXED_TESTS",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Converted a semantic runnable project step into fixed stdout tests because it has top-level file/report execution and printed output.",
                });

                return semanticRunnableProjectRepair;
            }

            if (isSemanticCodeExercise(completedFunctionFileRepair.exercise)) {
                return completedFunctionFileRepair.exercise;
            }

            const workingExercise = completedFunctionFileRepair.exercise;
            const missingTestsRepair = synthesizeMissingTestsForExercise(workingExercise);
            const hasAuthoredTests =
                Array.isArray(workingExercise.tests) && workingExercise.tests.length > 0;
            const derivedMissingTestsRepair =
                !missingTestsRepair && !hasAuthoredTests
                    ? await makeTestsFromNoInputSolution(workingExercise)
                    : null;
            const withTests =
                missingTestsRepair ?? derivedMissingTestsRepair ?? workingExercise;

            if (missingTestsRepair) {
                report.repairs.push({
                    code: "PYTHON_TESTS_SYNTHESIZED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Added fallback stdin/stdout tests to an input-driven or top-level-function Python code_input exercise after real execution could not derive them.",
                });
            }

            if (derivedMissingTestsRepair) {
                report.repairs.push({
                    code: "PYTHON_TESTS_DERIVED_FROM_SOLUTION",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Derived stdin/stdout tests by running a no-input Python solution that already prints output.",
                });
            }

            const hardcodedInputVariableRepair =
                rewriteHardcodedInputVariableExercise(withTests);

            const afterHardcodedInputVariableRepair =
                hardcodedInputVariableRepair ?? withTests;

            if (hardcodedInputVariableRepair) {
                report.repairs.push({
                    code: "PYTHON_HARDCODED_INPUT_VARIABLE_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Replaced a hardcoded beginner variable assignment with int(input()) so stdin/stdout tests validate the intended behavior.",
                });
            }

            const placeholderTestRepair =
                rewriteHardcodedPromptAlignedExercise(afterHardcodedInputVariableRepair);

            const afterPromptAlignedRepair =
                placeholderTestRepair ?? afterHardcodedInputVariableRepair;
            if (placeholderTestRepair) {
                report.repairs.push({
                    code: "PYTHON_PLACEHOLDER_TESTS_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Replaced placeholder boolean tests with prompt-aligned stdin/stdout cases and converted the exercise to read real input.",
                });
            }

            const executedPlaceholderRepair =
                await rewritePlaceholderTestsFromSolutionExecution(afterPromptAlignedRepair);
            const withAlignedTests =
                executedPlaceholderRepair ?? afterPromptAlignedRepair;

            if (executedPlaceholderRepair) {
                report.repairs.push({
                    code: "PYTHON_PLACEHOLDER_TESTS_EXECUTION_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Replaced placeholder boolean tests with the real stdout produced by the no-input Python solution.",
                });
            }

            const promptedInputRepair =
                rewritePromptedInputExercise(withAlignedTests);
            const afterPromptedInputRepair =
                promptedInputRepair ?? withAlignedTests;

            if (promptedInputRepair) {
                report.repairs.push({
                    code: "PYTHON_INPUT_PROMPT_REMOVED",
                    category: "recipe",
                    severity: "medium",
                    field: exercise.id,
                    message:
                        "Removed interactive input prompts from Python code_input starter and solution code so fixed tests only validate program output.",
                });
            }

            const semanticFunctionReturnRepair =
                convertFunctionReturnFixedTestsToSemantic(afterPromptedInputRepair);

            if (semanticFunctionReturnRepair) {
                report.repairs.push({
                    code: "PYTHON_FUNCTION_RETURN_FIXED_TESTS_CONVERTED_TO_SEMANTIC",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Converted a function-return fixed stdout exercise into semantic function_returns checks so learner code does not expose stdin parsing harnesses.",
                });

                return semanticFunctionReturnRepair;
            }

            const hardcodedFunctionExampleRepair =
                rewriteHardcodedFunctionExampleExercise(afterPromptedInputRepair);
            const afterHardcodedFunctionRepair =
                hardcodedFunctionExampleRepair ?? afterPromptedInputRepair;

            if (hardcodedFunctionExampleRepair) {
                report.repairs.push({
                    code: "PYTHON_HARDCODED_FUNCTION_EXAMPLE_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Replaced hardcoded example usage in a function exercise with a stdin/stdout wrapper so published tests validate the intended behavior.",
                });
            }

            const functionRuntimeRepair = rewriteFunctionReturnExercise(afterHardcodedFunctionRepair);
            const afterFunctionRuntimeRepair =
                functionRuntimeRepair ?? afterHardcodedFunctionRepair;
            const missingFunctionInputRepair =
                repairFunctionWrapperTestsWithMissingInputs(afterFunctionRuntimeRepair);

            const afterMissingFunctionInputRepair =
                missingFunctionInputRepair ?? afterFunctionRuntimeRepair;

            if (missingFunctionInputRepair) {
                report.repairs.push({
                    code: "PYTHON_FUNCTION_STDIN_ARITY_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Added safe missing stdin values for a wrapped Python function exercise whose tests provided fewer input lines than the function parameters.",
                });
            }
            const commaSeparatedStdinRepair =
                normalizeCommaSeparatedStdinForFunctionParams(afterMissingFunctionInputRepair);

            const afterCommaSeparatedStdinRepair =
                commaSeparatedStdinRepair ?? afterMissingFunctionInputRepair;
            if (commaSeparatedStdinRepair) {
                report.repairs.push({
                    code: "PYTHON_COMMA_SEPARATED_STDIN_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Converted comma-separated stdin for a multi-parameter function into one input value per line.",
                });
            }
            if (functionRuntimeRepair) {
                report.repairs.push({
                    code: "PYTHON_FUNCTION_STDOUT_TASK_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Rewrote a function-return code_input exercise into a runnable stdin/stdout task so it matches fixed-tests grading.",
                });
            }

            const harnessRepair =
                await rewriteEmbeddedHarnessStyleExercise(afterCommaSeparatedStdinRepair);
            const afterHarnessRepair =
                harnessRepair ?? afterCommaSeparatedStdinRepair;

            if (harnessRepair) {
                report.repairs.push({
                    code: "PYTHON_EMBEDDED_HARNESS_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Converted Python code stuffed into tests.stdin into visible runnable harness code so class exercises match fixed-tests grading.",
                });
            }

            const supportMethodRepair =
                await rewriteMissingOopSupportMethods(afterHarnessRepair);
            const afterSupportMethodRepair =
                supportMethodRepair ?? afterHarnessRepair;

            if (supportMethodRepair) {
                report.repairs.push({
                    code: "PYTHON_MISSING_OOP_SUPPORT_METHOD_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Added a missing support method needed by this object-oriented code_input exercise and regenerated its expected output.",
                });
            }

            const noOutputClassMethodRepair =
                await rewriteNoOutputClassMethodExercise(afterSupportMethodRepair);
            const afterClassMethodRepair =
                noOutputClassMethodRepair ?? afterSupportMethodRepair;

            if (noOutputClassMethodRepair) {
                report.repairs.push({
                    code: "PYTHON_NO_OUTPUT_CLASS_METHOD_TASK_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Made a no-output class/method code_input exercise observable by adding an instance-method print harness and regenerating expected output.",
                });
            }

            const noOutputListRepair =
                await rewriteNoOutputListConstructionExercise(afterClassMethodRepair);
            const afterNoOutputListRepair =
                noOutputListRepair ?? afterClassMethodRepair;

            if (noOutputListRepair) {
                report.repairs.push({
                    code: "PYTHON_NO_OUTPUT_LIST_TASK_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Made a list-construction code_input exercise observable by printing the list length and regenerating its expected output.",
                });
            }

            const noOutputNoArgFunctionRepair =
                await rewriteNoOutputNoArgFunctionExercise(afterNoOutputListRepair);

            const afterNoOutputNoArgFunctionRepair =
                noOutputNoArgFunctionRepair ?? afterNoOutputListRepair;

            if (noOutputNoArgFunctionRepair) {
                report.repairs.push({
                    code: "PYTHON_NO_OUTPUT_NO_ARG_FUNCTION_TASK_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Made a no-output no-argument function exercise observable by calling the function and regenerating expected stdout.",
                });
            }

            const fixtureSanitizationRepair = sanitizePythonExerciseFixtures(
                afterNoOutputNoArgFunctionRepair,
            );

            const afterFixtureSanitizationRepair = fixtureSanitizationRepair.changed
                ? fixtureSanitizationRepair.exercise
                : afterNoOutputNoArgFunctionRepair;

            if (fixtureSanitizationRepair.removedInvalidPaths > 0) {
                report.repairs.push({
                    code: "PYTHON_FILE_FIXTURE_INVALID_PATH_REMOVED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        `Removed ${fixtureSanitizationRepair.removedInvalidPaths} invalid Python fixture path(s) before golden validation.`,
                });
            }

            if (fixtureSanitizationRepair.removedUnreferencedPaths > 0) {
                report.repairs.push({
                    code: "PYTHON_FILE_FIXTURE_UNRELATED_PATH_REMOVED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        `Removed ${fixtureSanitizationRepair.removedUnreferencedPaths} unrelated Python fixture path(s) that were not read by the authored solution.`,
                });
            }

            if (fixtureSanitizationRepair.normalizedContents > 0 || fixtureSanitizationRepair.dedupedPaths > 0) {
                report.repairs.push({
                    code: "PYTHON_FILE_FIXTURE_SANITIZED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Sanitized Python fixture contents to remove oversized blank-line runs and duplicate fixture paths before golden validation.",
                });
            }

            const noStdinFileInputRepair = repairNoStdinFileInputCalls(
                afterFixtureSanitizationRepair,
            );

            const afterNoStdinFileInputRepair =
                noStdinFileInputRepair ?? afterFixtureSanitizationRepair;

            if (noStdinFileInputRepair) {
                report.repairs.push({
                    code: "PYTHON_NO_STDIN_FILE_INPUT_REMOVED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Removed top-level input() from a file-based fixed_tests exercise whose tests provide file fixtures but no stdin.",
                });
            }

            const initialFileFixtureRepair = repairPythonFileFixtures(
                afterNoStdinFileInputRepair,
            );

            const afterInitialFileFixtureRepair = initialFileFixtureRepair.changed
                ? initialFileFixtureRepair.exercise
                : afterNoStdinFileInputRepair;

            const goldenTestRepair = await rewriteTestsToMatchSolutionExecution(
                afterInitialFileFixtureRepair,
            );

            const repairedExercise = goldenTestRepair ?? afterInitialFileFixtureRepair;

            const fileFixtureRepair = repairPythonFileFixtures(repairedExercise);

            const afterFileFixtureRepair = fileFixtureRepair.changed
                ? fileFixtureRepair.exercise
                : repairedExercise;

            if (goldenTestRepair) {
                report.repairs.push({
                    code: "PYTHON_GOLDEN_TESTS_ALIGNED_WITH_SOLUTION",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Regenerated Python code_input expected stdout from solutionCode after applying file fixtures so golden validation matches the published tests.",
                });
            }

            const totalAddedTestFixtures =
                (initialFileFixtureRepair.changed
                    ? initialFileFixtureRepair.addedTestFixtures
                    : 0) +
                (fileFixtureRepair.changed ? fileFixtureRepair.addedTestFixtures : 0);

            const addedExerciseFixture =
                (initialFileFixtureRepair.changed &&
                    initialFileFixtureRepair.addedExerciseFixture) ||
                (fileFixtureRepair.changed && fileFixtureRepair.addedExerciseFixture);

            const alignedTests =
                (initialFileFixtureRepair.changed && initialFileFixtureRepair.alignedTests) ||
                (fileFixtureRepair.changed && fileFixtureRepair.alignedTests);
            if (totalAddedTestFixtures > 0) {                report.repairs.push({
                    code: "PYTHON_TEST_FILE_FIXTURE_ADDED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:`Added ${totalAddedTestFixtures} test-level Python file fixture set(s) so fixed_tests file I/O coverage matches each expected output.`,
                });
            }

            if (addedExerciseFixture) {                report.repairs.push({
                    code: "PYTHON_EXERCISE_FILE_FIXTURE_ADDED",
                    category: "recipe",
                    severity: "medium",
                    field: exercise.id,
                    message:
                        "Added a learner-visible default file fixture for a Python file I/O code_input exercise.",
                });
            }

            if (alignedTests) {
                report.repairs.push({
                    code: "PYTHON_FILE_FIXTURE_TESTS_ALIGNED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Aligned Python fixed_tests file fixtures with their expected outputs so golden validation can run each case safely.",
                });
            }

            const fileFixtureThinFixedTestRepair =
                await repairThinFileFixtureFixedTests(afterFileFixtureRepair);

            const afterFileFixtureThinFixedTestRepair =
                fileFixtureThinFixedTestRepair.status === "repaired"
                    ? fileFixtureThinFixedTestRepair.exercise
                    : afterFileFixtureRepair;

            if (fileFixtureThinFixedTestRepair.status === "repaired") {
                report.repairs.push({
                    code: "PYTHON_FILE_FIXTURE_FIXED_TEST_ADDED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message: `Added ${fileFixtureThinFixedTestRepair.addedCount} distinct file-fixture fixed test case(s).`,
                });
            }

            const thinFixedTestRepair = await repairThinFixedTests(
                afterFileFixtureThinFixedTestRepair,
            );
            const convertedStaticOutputExercise =
                thinFixedTestRepair.status === "unsafe" &&
                isOriginalSingleStaticOutputFixedTest(exercise)
                    ? convertStaticOutputExercise(afterFileFixtureThinFixedTestRepair)
                    : null;
            const afterThinFixedTestRepair =
                thinFixedTestRepair.status === "repaired"
                    ? thinFixedTestRepair.exercise
                    : convertedStaticOutputExercise ?? afterFileFixtureThinFixedTestRepair;

            if (thinFixedTestRepair.status === "repaired") {
                report.repairs.push({
                    code: "PYTHON_FIXED_TEST_ADDED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message: `Added ${thinFixedTestRepair.addedCount} distinct fixed test case(s) so this Python code_input meets the minimum fixed_tests coverage.`,
                });
            }

            if (thinFixedTestRepair.status === "unsafe") {
                report.repairs.push({
                    code: "PYTHON_FIXED_TEST_REPAIR_UNSAFE",
                    category: "recipe",
                    severity: "low",
                    field: exercise.id,
                    message: thinFixedTestRepair.reason,
                });
            }

            if (convertedStaticOutputExercise) {
                report.repairs.push({
                    code: "PYTHON_STATIC_OUTPUT_CODE_INPUT_CONVERTED_TO_CONCEPT_EXERCISE",
                    category: "recipe",
                    severity: "medium",
                    field: exercise.id,
                    message:
                        "Converted a static-output Python code_input into a concept exercise because it could not support two meaningful fixed tests.",
                });
            }

            const hintLeakRepair = rewritePythonLeakText(afterThinFixedTestRepair.hint);
            const conceptLeakRepair = rewritePythonLeakText(afterThinFixedTestRepair.help.concept);
            const hint1LeakRepair = rewritePythonLeakText(afterThinFixedTestRepair.help.hint_1);
            const hint2LeakRepair = rewritePythonLeakText(afterThinFixedTestRepair.help.hint_2);

            const hintRepair = rewriteBrowserSafeTracebackText(hintLeakRepair.next);
            const conceptRepair = rewriteBrowserSafeTracebackText(conceptLeakRepair.next);
            const hint1Repair = rewriteBrowserSafeTracebackText(hint1LeakRepair.next);
            const hint2Repair = rewriteBrowserSafeTracebackText(hint2LeakRepair.next);

            const changed =
                hintLeakRepair.changed ||
                conceptLeakRepair.changed ||
                hint1LeakRepair.changed ||
                hint2LeakRepair.changed ||
                hintRepair.changed ||
                conceptRepair.changed ||
                hint1Repair.changed ||
                hint2Repair.changed;

            if (!changed) return afterThinFixedTestRepair;

            if (hintLeakRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_SQL_HINT_LEAK_REPAIRED",
                    category: "text",
                    severity: "medium",
                    field: `${exercise.id}.hint`,
                    message:
                        "Rewrote a SQL-flavored stock hint into Python-specific guidance.",
                });
            }

            if (conceptLeakRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_SQL_HELP_LEAK_REPAIRED",
                    category: "text",
                    severity: "medium",
                    field: `${exercise.id}.help.concept`,
                    message:
                        "Rewrote SQL-flavored help text into Python-specific guidance.",
                });
            }

            if (hint1LeakRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_SQL_HELP_LEAK_REPAIRED",
                    category: "text",
                    severity: "medium",
                    field: `${exercise.id}.help.hint_1`,
                    message:
                        "Rewrote SQL-flavored help text into Python-specific guidance.",
                });
            }

            if (hint2LeakRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_SQL_HELP_LEAK_REPAIRED",
                    category: "text",
                    severity: "medium",
                    field: `${exercise.id}.help.hint_2`,
                    message:
                        "Rewrote SQL-flavored help text into Python-specific guidance.",
                });
            }

            const tracebackFields = [
                ["hint", hintRepair.changed],
                ["help.concept", conceptRepair.changed],
                ["help.hint_1", hint1Repair.changed],
                ["help.hint_2", hint2Repair.changed],
            ] as const;

            for (const [field, fieldChanged] of tracebackFields) {
                if (!fieldChanged) continue;

                report.repairs.push({
                    code: "PYTHON_BROWSER_TRACEBACK_FILENAME_REMOVED",
                    category: "text",
                    severity: "medium",
                    field: `${exercise.id}.${field}`,
                    message:
                        "Replaced .py filename traceback wording with browser code editor wording.",
                });
            }

            return {
                ...afterThinFixedTestRepair,
                hint: hintRepair.next,
                help: {
                    ...afterThinFixedTestRepair.help,
                    concept: conceptRepair.next,
                    hint_1: hint1Repair.next,
                    hint_2: hint2Repair.next,
                },
            };
        })),
    };

    nextDraft = await repairCrossExerciseClassDependencies({
        draft: nextDraft,
        report,
    });

    nextDraft = normalizePolicyExerciseCounts({
        seed: args.seed,
        draft: nextDraft,
        report,
    });
    nextDraft = repairPythonBrowserWorkspaceTerms({
        draft: nextDraft,
        seed: args.seed,
        report,
    });
    const hadTryItYourselfSketch = hasTryItYourselfSketch(nextDraft);
    nextDraft = ensureTryItYourselfSketch(nextDraft);

    if (!hadTryItYourselfSketch) {report.repairs.push({
        code: "PYTHON_TRY_IT_YOURSELF_SKETCH_ADDED",
        category: "other",
        severity: "medium",
        field: "sketchBlocks",
        message:
            "Added a Try it yourself learner action required by programming teaching validation.",
    });
    }

    return {
        draft: nextDraft,
        report,
    };
}
