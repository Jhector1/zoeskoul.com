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
}): CodeFeedback {
    return {
        area: "code",
        source: args.source,
        kind: args.kind,
        tone: args.tone,
        title: args.title,
        message: args.message,
        line: args.raw ? parseFirstLineNumber(args.raw) : null,
        column: null,
        raw: args.raw ?? null,
    };
}

function classifyPython(raw: string, source: FeedbackSource): CodeFeedback {
    const s = raw.toLowerCase();

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
        s.includes("unexpected eof while parsing")
    ) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "Missing closing symbol",
            message: "Check for a missing closing parenthesis, bracket, or brace.",
            raw,
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
): CodeFeedback {
    const raw = joinedRunText(run);
    const lang = String(language ?? "").toLowerCase();

    if (lang === "python") return classifyPython(raw, source);
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
        if (code.includes("input(") && !code.includes("int(input(") && !code.includes("float(input(")) {
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