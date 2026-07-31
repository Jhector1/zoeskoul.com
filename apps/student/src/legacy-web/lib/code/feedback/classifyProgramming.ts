import type { CodeFeedback, CodeFeedbackKind, CodeFeedbackTone } from "./types";

export type FeedbackSource = "run" | "check";

function clean(text: unknown) {
    return String(text ?? "").trim();
}

function joinedRunText(run: any) {
    return [
        clean(run?.error),
        clean(run?.message),
        clean(run?.compile_output),
        clean(run?.stderr),
    ]
        .filter(Boolean)
        .join("\n");
}
function getLastNonEmptyCodeLine(code?: string | null): number | null {
    const lines = String(code ?? "").split(/\r?\n/);

    for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (lines[i].trim()) return i + 1;
    }

    return null;
}

function parseFirstLineNumber(text: string): number | null {
    const patterns = [
        /line\s+(\d+)/i,
        /:(\d+):\d+/,
        /:(\d+):/,
    ];

    for (const re of patterns) {
        const m = text.match(re);
        if (m?.[1]) return Number(m[1]);
    }

    return null;
}

function makeFeedback(args: {
    source: FeedbackSource;
    kind: CodeFeedbackKind;
    tone: CodeFeedbackTone;
    title: string;
    message: string;
    raw?: string | null;
    line?: number | null;
}): CodeFeedback {
    return {
        area: "code",
        source: args.source,
        kind: args.kind,
        tone: args.tone,
        title: args.title,
        message: args.message,
        line:
            typeof args.line === "number"
                ? args.line
                : args.raw
                    ? parseFirstLineNumber(args.raw)
                    : null,
        column: null,
        raw: args.raw ?? null,
    };
}

function stripPythonLineComments(source: string): string {
    return String(source ?? "")
        .split(/\r?\n/)
        .map((line) => {
            const hashIndex = line.indexOf("#");
            return hashIndex >= 0 ? line.slice(0, hashIndex) : line;
        })
        .join("\n");
}

function normalizeCompact(value: string): string {
    return String(value ?? "").replace(/\s+/g, "");
}

function getPythonInputVariableNames(code: string): string[] {
    const names = new Set<string>();
    const source = stripPythonLineComments(code);
    const re =
        /\b([A-Za-z_]\w*)\s*=\s*(?:int\s*\(\s*input\s*\(|float\s*\(\s*input\s*\(|input\s*\()/g;

    let match: RegExpExecArray | null = re.exec(source);
    while (match) {
        if (match[1]) names.add(match[1]);
        match = re.exec(source);
    }

    return [...names];
}

function getListVariablesBuiltFromInputs(code: string): string[] {
    const inputNames = new Set(getPythonInputVariableNames(code));
    if (!inputNames.size) return [];

    const source = stripPythonLineComments(code);
    const listVariables: string[] = [];
    const re = /\b([A-Za-z_]\w*)\s*=\s*\[([^\]]+)\]/g;

    let match: RegExpExecArray | null = re.exec(source);
    while (match) {
        const variableName = match[1]?.trim();
        const rawItems = match[2] ?? "";
        const items = rawItems
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

        if (
            variableName &&
            items.length >= 2 &&
            items.every((item) => inputNames.has(item))
        ) {
            listVariables.push(variableName);
        }

        match = re.exec(source);
    }

    return listVariables;
}

function codePrintsVariable(code: string, variableName: string): boolean {
    const source = stripPythonLineComments(code);
    return new RegExp(
        `\\bprint\\s*\\([^\\n]*\\b${variableName}\\b[^\\n]*\\)`,
    ).test(source);
}

function codePrintsGotLiteral(code: string, got: string): boolean {
    const source = stripPythonLineComments(code);
    const compactGot = normalizeCompact(got);

    if (!compactGot) return false;

    const listPrints = source.match(/\bprint\s*\(\s*(\[[^\]]+\])\s*\)/g) ?? [];

    for (const printCall of listPrints) {
        const literalMatch = printCall.match(/\bprint\s*\(\s*(\[[^\]]+\])\s*\)/);
        const literal = literalMatch?.[1] ?? "";

        if (normalizeCompact(literal) === compactGot) {
            return true;
        }
    }

    const stringPrints =
        source.match(/\bprint\s*\(\s*(['"])(?:\\.|(?!\1).)*\1\s*\)/g) ?? [];

    for (const printCall of stringPrints) {
        const literalMatch = printCall.match(
            /\bprint\s*\(\s*((['"])(?:\\.|(?!\2).)*\2)\s*\)/,
        );
        const literal = literalMatch?.[1] ?? "";
        const unwrapped = literal.replace(/^(['"])(.*)\1$/, "$2");

        if (normalizeCompact(unwrapped) === compactGot) {
            return true;
        }
    }

    return false;
}

function textLooksNumeric(value: string): boolean {
    const trimmed = String(value ?? "").trim();

    if (!trimmed) return false;

    const numericPatterns = [
        /^-?\d+(?:\.\d+)?$/,
        /^\[\s*-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)*\s*\]$/,
        /^\(\s*-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)*\s*\)$/,
    ];

    return numericPatterns.some((pattern) => pattern.test(trimmed));
}

function semanticChecksSuggestNumericWork(semanticChecks: unknown[]): boolean {
    const seen = new Set<unknown>();

    function visit(value: unknown): boolean {
        if (typeof value === "number") return true;
        if (value == null || typeof value === "boolean") return false;

        if (typeof value === "string") {
            return /\b(?:int|float|number|numeric)\b/i.test(value);
        }

        if (seen.has(value)) return false;
        seen.add(value);

        if (Array.isArray(value)) {
            return value.some(visit);
        }

        if (typeof value === "object") {
            return Object.values(value as Record<string, unknown>).some(visit);
        }

        return false;
    }

    return semanticChecks.some(visit);
}

function codeLikelyNeedsNumericConversion(code: string): boolean {
    const inputNames = getPythonInputVariableNames(code);
    if (!inputNames.length) return false;

    const source = stripPythonLineComments(code);

    for (const name of inputNames) {
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const patterns = [
            new RegExp(`\\b${escapedName}\\b\\s*[+\\-*/%]`),
            new RegExp(`[+\\-*/%]\\s*\\b${escapedName}\\b`),
            new RegExp(`\\b${escapedName}\\b\\s*(?:<|>|<=|>=)`),
            new RegExp(`(?:<|>|<=|>=)\\s*\\b${escapedName}\\b`),
        ];

        if (patterns.some((pattern) => pattern.test(source))) {
            return true;
        }
    }

    return false;
}

function shouldSuggestMissingConversion(args: {
    code: string;
    want: string;
    semanticChecks?: unknown[];
}): boolean {
    const code = String(args.code ?? "");

    if (
        !code.includes("input(") ||
        code.includes("int(input(") ||
        code.includes("float(input(")
    ) {
        return false;
    }

    if (textLooksNumeric(args.want)) {
        return true;
    }

    if (
        Array.isArray(args.semanticChecks) &&
        semanticChecksSuggestNumericWork(args.semanticChecks)
    ) {
        return true;
    }

    return codeLikelyNeedsNumericConversion(code);
}

function classifyPython(
    raw: string,
    source: FeedbackSource,
    code?: string | null,
): CodeFeedback {    const s = raw.toLowerCase();

    if (s.includes("indentationerror")) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "Indentation error",
            message: "Check the spaces at the start of your lines. Python blocks must line up correctly.",
            raw,
        });
    }

    if (s.includes("expected ':'") || s.includes("syntaxerror: expected ':'")) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "Missing colon",
            message: "It looks like you are missing a `:` after a block statement such as `if`, `for`, `while`, or `def`.",
            raw,
        });
    }

    if (s.includes("unterminated string") || s.includes("eol while scanning string literal")) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "Missing quote",
            message: "A string is not closed. Check that every quote has a matching closing quote.",
            raw,
        });
    }

    if (
        s.includes("'(' was never closed") ||
        s.includes("'[' was never closed") ||
        s.includes("'{' was never closed") ||
        s.includes("unexpected eof while parsing") ||
        s.includes("incomplete statement")
    ) {
        const eofLike =
            s.includes("unexpected eof while parsing") ||
            s.includes("incomplete statement");

        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "Missing closing symbol",
            message: "Check for a missing closing parenthesis, bracket, or brace.",
            raw,
            line: eofLike ? getLastNonEmptyCodeLine(code) : undefined,
        });
    }

    if (s.includes("nameerror")) {
        return makeFeedback({
            source,
            kind: "runtime",
            tone: "danger",
            title: "Unknown name",
            message: "You are using a variable or name that Python does not recognize yet. Check spelling and define it first.",
            raw,
        });
    }

    if (s.includes("typeerror")) {
        return makeFeedback({
            source,
            kind: "runtime",
            tone: "danger",
            title: "Type error",
            message: "You may be mixing text and numbers. Convert input before doing math.",
            raw,
        });
    }

    if (s.includes("valueerror: invalid literal for int()")) {
        return makeFeedback({
            source,
            kind: "input",
            tone: "warning",
            title: "Input conversion issue",
            message: "Your code is trying to convert text into an integer, but the value is not valid whole-number text.",
            raw,
        });
    }

    if (s.includes("eoferror")) {
        return makeFeedback({
            source,
            kind: "input",
            tone: "warning",
            title: "Incomplete",
            message: "Hmm! the code seems incomplete or you missed a step.",
            raw,
        });
    }

    return makeFeedback({
        source,
        kind: "runtime",
        tone: "danger",
        title: "Python error",
        message: "Your code has a Python error. Check indentation, punctuation, quotes, and variable names.",
        raw,
    });
}

function classifyJavaScript(raw: string, source: FeedbackSource): CodeFeedback {
    const s = raw.toLowerCase();

    if (s.includes("unexpected end of input")) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "Missing closing symbol",
            message: "Something is not closed. Check quotes, parentheses, braces, or brackets.",
            raw,
        });
    }

    if (s.includes("missing ) after argument list")) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "Missing parenthesis",
            message: "It looks like a function call is missing a closing parenthesis.",
            raw,
        });
    }

    if (s.includes("unexpected token")) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "Syntax error",
            message: "Check punctuation, braces, commas, and separators near the reported line.",
            raw,
        });
    }

    if (s.includes("referenceerror")) {
        return makeFeedback({
            source,
            kind: "runtime",
            tone: "danger",
            title: "Unknown name",
            message: "You are using a variable or function name that is not defined.",
            raw,
        });
    }

    return makeFeedback({
        source,
        kind: "runtime",
        tone: "danger",
        title: "JavaScript error",
        message: "Your code has a JavaScript syntax or runtime error. Check punctuation and variable names.",
        raw,
    });
}

function classifyJava(raw: string, source: FeedbackSource): CodeFeedback {
    const s = raw.toLowerCase();

    if (s.includes("';' expected")) {
        return makeFeedback({
            source,
            kind: "compile",
            tone: "danger",
            title: "Missing semicolon",
            message: "It looks like you missed a semicolon.",
            raw,
        });
    }

    if (s.includes("reached end of file while parsing")) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "Missing closing symbol",
            message: "Something is not closed. Check braces, parentheses, or quotes.",
            raw,
        });
    }

    if (s.includes("cannot find symbol")) {
        return makeFeedback({
            source,
            kind: "compile",
            tone: "danger",
            title: "Unknown symbol",
            message: "Java cannot find a variable, method, or class name. Check spelling and declarations.",
            raw,
        });
    }

    return makeFeedback({
        source,
        kind: "compile",
        tone: "danger",
        title: "Java compile error",
        message: "Your code has a Java compile/runtime error. Check semicolons, braces, and names.",
        raw,
    });
}

function classifyCStyle(raw: string, source: FeedbackSource): CodeFeedback {
    const s = raw.toLowerCase();

    if (s.includes("expected ';'")) {
        return makeFeedback({
            source,
            kind: "compile",
            tone: "danger",
            title: "Missing semicolon",
            message: "It looks like you missed a semicolon.",
            raw,
        });
    }

    if (s.includes("missing terminating")) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "Missing quote",
            message: "A string looks unfinished. Check that every quote has a closing quote.",
            raw,
        });
    }

    if (
        s.includes("expected ')'") ||
        s.includes("expected '}'") ||
        s.includes("expected ']'")
    ) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "Missing closing symbol",
            message: "Check for a missing closing parenthesis, brace, or bracket.",
            raw,
        });
    }

    return makeFeedback({
        source,
        kind: "compile",
        tone: "danger",
        title: "Compile error",
        message: "Your code has a compile/runtime error. Check semicolons, braces, quotes, and declarations.",
        raw,
    });
}

export function classifyProgrammingRunFailure(
    language: string,
    run: any,
    source: FeedbackSource = "run",
    code?: string | null,
): CodeFeedback {
    const raw = joinedRunText(run);
    const lang = String(language ?? "").toLowerCase();

    if (lang === "python") return classifyPython(raw, source, code);
    if (lang === "javascript" || lang === "js" || lang === "typescript" || lang === "ts") {
        return classifyJavaScript(raw, source);
    }
    if (lang === "java") return classifyJava(raw, source);
    if (lang === "c" || lang === "cpp" || lang === "c++") return classifyCStyle(raw, source);

    return makeFeedback({
        source,
        kind: "runtime",
        tone: "danger",
        title: "Code error",
        message: "Your program has an error. Check syntax, punctuation, and variable names.",
        raw,
    });
}

export function classifyProgrammingOutputMismatch(args: {
    got: string;
    want: string;
    language: string;
    code: string;
    source?: FeedbackSource;
    semanticChecks?: unknown[];
}): CodeFeedback {
    const got = String(args.got ?? "").replace(/\r\n/g, "\n").trimEnd();
    const want = String(args.want ?? "").replace(/\r\n/g, "\n").trimEnd();
    const code = String(args.code ?? "");
    const lang = String(args.language ?? "").toLowerCase();
    const source = args.source ?? "check";

    if (!got.trim()) {
        return makeFeedback({
            source,
            kind: "logic",
            tone: "warning",
            title: "Nothing printed",
            message: "Your program ran, but it did not print the expected output. Check that you call `print(...)` or the language equivalent.",
        });
    }

    const gotLines = got.split("\n");
    const wantLines = want.split("\n");

    if (gotLines.length !== wantLines.length) {
        return makeFeedback({
            source,
            kind: "format",
            tone: "warning",
            title: "Wrong number of lines",
            message: "Your output has the wrong number of lines. Check how many times you print.",
        });
    }

    if (got.replace(/\s+/g, " ").trim() === want.replace(/\s+/g, " ").trim()) {
        return makeFeedback({
            source,
            kind: "format",
            tone: "warning",
            title: "Formatting issue",
            message: "Your output is very close, but the exact spacing or line formatting is off.",
        });
    }

    if (lang === "python") {
        const listVariablesBuiltFromInputs = getListVariablesBuiltFromInputs(code);

        if (
            listVariablesBuiltFromInputs.some(
                (variableName) => !codePrintsVariable(code, variableName),
            )
        ) {
            return makeFeedback({
                source,
                kind: "logic",
                tone: "warning",
                title: "Print the list variable",
                message: "You created the list, but the printed value is not using it. Try printing your list variable.",
            });
        }

        if (code.includes("input(") && codePrintsGotLiteral(code, got)) {
            return makeFeedback({
                source,
                kind: "logic",
                tone: "warning",
                title: "Hard-coded example output",
                message: "You may be printing the example values directly. Build the list from the input variables, then print that list.",
            });
        }

        if (
            shouldSuggestMissingConversion({
                code,
                want,
                semanticChecks: args.semanticChecks,
            })
        ) {
            return makeFeedback({
                source,
                kind: "logic",
                tone: "warning",
                title: "Maybe missing conversion",
                message: "You may have forgotten to convert input before doing math. Remember: `input()` returns text.",
            });
        }
    }

    return makeFeedback({
        source,
        kind: "logic",
        tone: "warning",
        title: "Logic or formula issue",
        message: "Your program runs, but the result is not correct yet. Recheck the formula, conversion steps, and exact output format.",
    });
}

export function isProgrammingInputHaltResult(language: string, result: any) {
    const blob = [
        String(result?.compile_output ?? ""),
        String(result?.stderr ?? ""),
        String(result?.message ?? ""),
        String(result?.error ?? ""),
    ]
        .join("\n")
        .toLowerCase();

    const lang = String(language ?? "").toLowerCase();

    if (lang === "python") return blob.includes("eoferror");
    if (lang === "java") return blob.includes("nosuchelementexception");

    return false;
}
