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

export function classifySqlRunFailure(
    run: any,
    source: FeedbackSource = "run",
): CodeFeedback {
    const raw = joinedRunText(run);
    const s = raw.toLowerCase();

    if (s.includes("more than one statement") || s.includes("only execute one statement")) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "warning",
            title: "Too many statements",
            message: "This exercise expects a single SQL statement. Remove extra statements and run one query at a time.",
            raw,
        });
    }

    if (s.includes("syntax error") || s.includes("near ")) {
        return makeFeedback({
            source,
            kind: "syntax",
            tone: "danger",
            title: "SQL syntax error",
            message: "Your query has a SQL syntax issue. Check commas, keywords, parentheses, quotes, and clause order.",
            raw,
        });
    }

    if (s.includes("no such table") || s.includes("relation") && s.includes("does not exist")) {
        return makeFeedback({
            source,
            kind: "runtime",
            tone: "danger",
            title: "Table not found",
            message: "The table name does not exist in this dataset. Check the table name and spelling carefully.",
            raw,
        });
    }

    if (s.includes("no such column") || s.includes("column") && s.includes("does not exist")) {
        return makeFeedback({
            source,
            kind: "runtime",
            tone: "danger",
            title: "Column not found",
            message: "One of your column names is not valid for this table. Check the column names and spelling.",
            raw,
        });
    }

    if (s.includes("ambiguous column")) {
        return makeFeedback({
            source,
            kind: "logic",
            tone: "warning",
            title: "Ambiguous column",
            message: "SQL cannot tell which table this column comes from. Add the table name or alias before the column.",
            raw,
        });
    }

    if (s.includes("datatype mismatch")) {
        return makeFeedback({
            source,
            kind: "runtime",
            tone: "danger",
            title: "Type mismatch",
            message: "A value in your query does not match the expected data type. Check numbers, text quotes, and comparisons.",
            raw,
        });
    }

    if (
        s.includes("not null constraint failed") ||
        s.includes("unique constraint failed") ||
        s.includes("foreign key constraint failed") ||
        s.includes("constraint failed")
    ) {
        return makeFeedback({
            source,
            kind: "runtime",
            tone: "danger",
            title: "Constraint failed",
            message: "Your statement violates a table rule such as NOT NULL, UNIQUE, or FOREIGN KEY.",
            raw,
        });
    }

    return makeFeedback({
        source,
        kind: "runtime",
        tone: "danger",
        title: "SQL error",
        message: "Your SQL statement has an error. Check the table names, column names, keywords, and clause order.",
        raw,
    });
}

export function classifySqlResultMismatch(args?: {
    source?: FeedbackSource;
    title?: string;
    message?: string;
}): CodeFeedback {
    return makeFeedback({
        source: args?.source ?? "check",
        kind: "logic",
        tone: "warning",
        title: args?.title ?? "Query result is not correct",
        message:
            args?.message ??
            "Your query ran, but the returned table does not match the expected result. Check the selected columns, filtering, sorting, grouping, and returned rows.",
    });
}

export function classifySqlMissingResultTable(
    source: FeedbackSource = "check",
): CodeFeedback {
    return makeFeedback({
        source,
        kind: "logic",
        tone: "warning",
        title: "No result table found",
        message: "Your SQL ran, but no readable result table was returned. Run a query that returns rows and columns for this exercise.",
    });
}