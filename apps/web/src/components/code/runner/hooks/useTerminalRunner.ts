"use client";

import * as React from "react";
import type { RunResult } from "@/lib/code/types";
import type { TermLine, OnRun, RunnerState } from "../types";
import { cleanTermText, toLines } from "../utils/text";
import { inferInputPlan } from "../utils/input";
import { expandPrompts, prettyPrompt, splitStdoutByPrompts } from "../utils/prompts";
import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";

type AbortKind = "none" | "silent" | "user";

function needsMoreInput(lang: CodeLanguage, r: RunResult) {
    const blob = cleanTermText(
        (r.compile_output ?? "") +
        "\n" +
        (r.stderr ?? "") +
        "\n" +
        (r.message ?? "") +
        "\n" +
        (r.error ?? ""),
    );

    if (lang === "python") return /\bEOFError\b/.test(blob);
    return false;
}

function readAbortKind(ref: React.MutableRefObject<AbortKind>): AbortKind {
    return ref.current;
}

function isCanceledResult(r: RunResult | null | undefined) {
    return r?.status === "Canceled";
}

function errorMessage(err: unknown) {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return "Run failed.";
}

function isAbortLike(err: unknown, signal?: AbortSignal) {
    if (signal?.aborted) return true;
    if (err instanceof DOMException && err.name === "AbortError") return true;

    const message =
        err instanceof Error
            ? err.message
            : typeof err === "string"
                ? err
                : "";

    return /abort|aborted|cancel|cancelled/i.test(message);
}

function toOutTermLines(seg: string): TermLine[] {
    const lines = toLines(cleanTermText(seg ?? ""));
    return lines
        .filter((l) => l === "" || l.trim().length > 0)
        .map((t) => ({ type: "out" as const, text: t }));
}

function unescapeSourceString(x: string) {
    const s = String(x ?? "");
    let out = "";

    for (let i = 0; i < s.length; ) {
        const ch = s[i];
        if (ch !== "\\") {
            out += ch;
            i++;
            continue;
        }

        const nxt = s[i + 1];
        if (nxt == null) {
            out += "\\";
            i++;
            continue;
        }

        switch (nxt) {
            case "\\":
                out += "\\";
                i += 2;
                break;
            case "n":
                out += "\n";
                i += 2;
                break;
            case "r":
                out += "\r";
                i += 2;
                break;
            case "t":
                out += "\t";
                i += 2;
                break;
            case '"':
                out += '"';
                i += 2;
                break;
            default:
                out += nxt;
                i += 2;
                break;
        }
    }

    return out;
}

function extractPreInputPrintedPieces(
    lang: CodeLanguage,
    code: string,
    prompts: string[],
): string[] {
    const src = String(code ?? "");

    const firstInputIdx =
        lang === "c"
            ? (() => {
                const i = src.search(/\bscanf\s*\(|\bgets\s*\(|\bfgets\s*\(/);
                return i >= 0 ? i : src.length;
            })()
            : lang === "cpp"
                ? (() => {
                    const i = src.search(/\b(?:std::)?cin\s*>>|\bgetline\s*\(/);
                    return i >= 0 ? i : src.length;
                })()
                : lang === "java"
                    ? (() => {
                        const i = src.search(
                            /\.\s*next(?:\s*\(|Line\s*\(|Int\s*\(|Long\s*\(|Double\s*\(|Float\s*\(|Boolean\s*\(|Short\s*\(|Byte\s*\()/,
                        );
                        return i >= 0 ? i : src.length;
                    })()
                    : src.length;

    const pre = src.slice(0, firstInputIdx);
    const pieces: string[] = [];

    if (lang === "c") {
        const re = /\bprintf\s*\(\s*"((?:\\.|[^"\\])*)"/g;
        for (const m of pre.matchAll(re)) {
            pieces.push(unescapeSourceString(m[1] ?? ""));
        }
    } else if (lang === "cpp") {
        const re = /\b(?:std::)?cout\s*<<\s*"((?:\\.|[^"\\])*)"|<<\s*(?:std::)?endl\b/g;
        for (const m of pre.matchAll(re)) {
            if (typeof m[1] === "string") {
                pieces.push(unescapeSourceString(m[1] ?? ""));
            } else {
                pieces.push("\n");
            }
        }
    } else if (lang === "java") {
        const re = /System\.out\.(print|println)\(\s*"((?:\\.|[^"\\])*)"\s*\)\s*;/g;
        for (const m of pre.matchAll(re)) {
            const kind = m[1] ?? "print";
            const text = unescapeSourceString(m[2] ?? "");
            pieces.push(kind === "println" ? `${text}\n` : text);
        }
    }

    const promptSet = new Set(prompts.map((p) => String(p ?? "").trimEnd()));

    return pieces.filter((piece) => {
        const trimmed = String(piece ?? "").trimEnd();
        if (!trimmed) return piece.includes("\n");
        return !promptSet.has(trimmed);
    });
}

function consumePrefixVariant(s: string, variants: string[]) {
    for (const v of variants) {
        if (!v) continue;
        if (s.startsWith(v)) return s.slice(v.length);
    }
    return null;
}

function consumePieceIfPresent(s: string, piece: string, allowPromptSpace = false) {
    const variants = allowPromptSpace && !piece.endsWith(" ") ? [`${piece} `, piece] : [piece];

    let next = consumePrefixVariant(s, variants);
    if (next != null) return next;

    const strippedNl = s.replace(/^(?:\r\n|\r|\n)+/, "");
    if (strippedNl !== s) {
        next = consumePrefixVariant(strippedNl, variants);
        if (next != null) return next;
    }

    return s;
}

function consumeEchoIfPresent(s: string, typed: string) {
    const value = String(typed ?? "");
    if (!value) return s;

    const variants = [
        `${value}\r\n`,
        `${value}\n`,
        value,
        ` ${value}\r\n`,
        ` ${value}\n`,
        ` ${value}`,
    ];

    let next = consumePrefixVariant(s, variants);
    if (next != null) return next;

    const strippedNl = s.replace(/^(?:\r\n|\r|\n)+/, "");
    if (strippedNl !== s) {
        next = consumePrefixVariant(strippedNl, variants);
        if (next != null) return next;
    }

    return s;
}

function stripKnownStaticPrefix(
    stdout: string,
    prePieces: string[],
    prompts: string[],
    typedInputs: string[],
) {
    let s = cleanTermText(stdout ?? "");

    for (const piece of prePieces) {
        s = consumePieceIfPresent(s, piece, false);
    }

    for (let i = 0; i < typedInputs.length; i++) {
        const prompt = String(prompts[i] ?? "Input:").trimEnd();
        if (prompt) {
            s = consumePieceIfPresent(s, prompt, true);
        }
        s = consumeEchoIfPresent(s, typedInputs[i] ?? "");
    }

    return s.replace(/^(?:\r\n|\r|\n)+/, "");
}

export function useTerminalRunner(args: {
    lang: CodeLanguage;
    code: string;
    sqlDialect?: SqlDialect;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlDatasetId?: string;
    disabled: boolean;
    allowRun: boolean;
    resetTerminalOnRun: boolean;
    onRun: OnRun;
}) {
    const {
        lang,
        code,
        sqlDialect,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlDatasetId,
        disabled,
        allowRun,
        resetTerminalOnRun,
        onRun,
    } = args;

    const [stdinBuffer, setStdinBuffer] = React.useState("");
    const [terminal, setTerminal] = React.useState<TermLine[]>([]);
    const [awaitingInput, setAwaitingInput] = React.useState(false);
    const [inputPrompt, setInputPrompt] = React.useState("");
    const [inputLine, setInputLine] = React.useState("");
    const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

    const [busy, setBusy] = React.useState(false);
    const [lastResult, setLastResult] = React.useState<RunResult | null>(null);
    const [lastRunLanguage, setLastRunLanguage] = React.useState<CodeLanguage | null>(null);
    const [runState, setRunState] = React.useState<RunnerState>("idle");

    const runLockRef = React.useRef(false);
    const runIdRef = React.useRef(0);
    const activeRunIdRef = React.useRef<number | null>(null);

    const [typedLines, setTypedLines] = React.useState<string[]>([]);
    const probeStdoutRef = React.useRef<string>("");

    const abortRef = React.useRef<AbortController | null>(null);
    const abortKindRef = React.useRef<AbortKind>("none");
    const mountedRef = React.useRef(true);

    const isSql = lang === "sql";
    const isProbeMode = lang === "python";

    const inputPlan = React.useMemo(() => inferInputPlan(lang, code), [lang, code]);

    const staticPrePieces = React.useMemo(
        () => extractPreInputPrintedPieces(lang, code, inputPlan.prompts),
        [lang, code, inputPlan.prompts],
    );

    const staticPreLines = React.useMemo(
        () => toOutTermLines(staticPrePieces.join("")),
        [staticPrePieces],
    );

    const resolvedSqlDialect = sqlDialect ?? "sqlite";
    const resolvedSchemaSql = sqlSchemaSql ?? sqlSetupSql ?? "";

    const abortActiveRun = React.useCallback((kind: AbortKind) => {
        if (!abortRef.current) return;
        abortKindRef.current = kind;
        abortRef.current.abort();
    }, []);

    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            abortActiveRun("silent");
        };
    }, [abortActiveRun]);

    const replaceRunLines = React.useCallback((runId: number, lines: TermLine[]) => {
        const tagged = lines.map((l) => ({ ...l, runId }));
        setTerminal((prev) => [...prev.filter((l) => l.runId !== runId), ...tagged]);
    }, []);

    const appendImmediateInputLine = React.useCallback(
        (runId: number, typed: string, prompt?: string) => {
            const value = String(typed ?? "");
            const p = String(prompt ?? "").trim();
            const text = p ? `${p} ${value}` : value;
            setTerminal((prev) => [...prev, { type: "in", text, runId }]);
        },
        [],
    );

    const appendRunLine = React.useCallback((runId: number, line: TermLine) => {
        setTerminal((prev) => [...prev, { ...line, runId }]);
    }, []);

    const appendProcessingLine = React.useCallback((runId: number) => {
        setTerminal((prev) => {
            const last = prev[prev.length - 1];
            if (last?.runId === runId && last?.type === "sys" && last?.text === "Processing...") {
                return prev;
            }
            return [...prev, { type: "sys", text: "Processing...", runId }];
        });
    }, []);

    const appendSysLine = React.useCallback((text: string, runId?: number) => {
        const resolvedRunId = runId ?? activeRunIdRef.current ?? runIdRef.current;
        setTerminal((prev) => {
            const last = prev[prev.length - 1];
            if (last?.runId === resolvedRunId && last?.type === "sys" && last?.text === text) {
                return prev;
            }
            return [...prev, { type: "sys", text, runId: resolvedRunId }];
        });
    }, []);

    const appendErrLine = React.useCallback(
        (text: string, runId?: number) => {
            const resolvedRunId = runId ?? activeRunIdRef.current ?? runIdRef.current;
            appendRunLine(resolvedRunId, { type: "err", text });
        },
        [appendRunLine],
    );

    const clearInputUi = React.useCallback(() => {
        setAwaitingInput(false);
        setInputPrompt("");
        setInputLine("");
    }, []);

    const resetTerminal = React.useCallback(() => {
        abortActiveRun("silent");

        setTerminal([]);
        clearInputUi();
        setLastResult(null);
        setLastRunLanguage(null);
        setStdinBuffer("");
        setTypedLines([]);
        setRunState("idle");

        activeRunIdRef.current = null;
        probeStdoutRef.current = "";
    }, [abortActiveRun, clearInputUi]);

    const runOnce = React.useCallback(
        async (stdinToUse: string): Promise<RunResult | null> => {
            if (runLockRef.current) return null;

            const ctrl = new AbortController();
            abortRef.current = ctrl;
            abortKindRef.current = "none";
            runLockRef.current = true;

            if (mountedRef.current) {
                setBusy(true);
                setLastResult(null);
                setRunState((prev) => (prev === "canceling" ? "canceling" : "starting"));
            }

            try {
                if (mountedRef.current) {
                    setRunState((prev) => (prev === "canceling" ? "canceling" : "running"));
                }

                const data = isSql
                    ? await onRun({
                        language: "sql",
                        code,
                        sqlDialect: resolvedSqlDialect,
                        sqlSchemaSql: resolvedSchemaSql,
                        sqlSeedSql,
                        datasetId: sqlDatasetId,
                        signal: ctrl.signal,
                    } as any)
                    : await onRun({
                        language: lang,
                        code,
                        stdin: stdinToUse,
                        signal: ctrl.signal,
                    });

                if (mountedRef.current) {
                    setLastResult(data);
                }

                return data;
            } catch (e: unknown) {
                const aborted = isAbortLike(e, ctrl.signal);

                if (aborted) {
                    const wasUserCancel = readAbortKind(abortKindRef) === "user";

                    if (mountedRef.current) {
                        if (wasUserCancel) {
                            setLastResult({
                                ok: false,
                                status: "Canceled",
                                error: "Run canceled by user.",
                            });
                        } else {
                            setLastResult(null);
                        }
                        setRunState("idle");
                    }

                    return wasUserCancel
                        ? {
                            ok: false,
                            status: "Canceled",
                            error: "Run canceled by user.",
                        }
                        : null;
                }

                const data: RunResult = {
                    ok: false,
                    status: "Error",
                    error: errorMessage(e),
                };

                if (mountedRef.current) {
                    setLastResult(data);
                    setRunState("idle");
                }

                return data;
            } finally {
                if (abortRef.current === ctrl) {
                    abortRef.current = null;
                    abortKindRef.current = "none";
                }

                runLockRef.current = false;

                if (mountedRef.current) {
                    setBusy(false);
                }
            }
        },
        [
            onRun,
            isSql,
            lang,
            code,
            resolvedSqlDialect,
            resolvedSchemaSql,
            sqlSeedSql,
            sqlDatasetId,
        ],
    );

    const buildPromptInputLines = React.useCallback(
        (lines: string[]): TermLine[] =>
            lines.map((val, i) => ({
                type: "in" as const,
                text: `${prettyPrompt(inputPlan.prompts[i] || "Input:")} ${val}`,
            })),
        [inputPlan.prompts],
    );

    const rebuildProbeTranscript = React.useCallback(
        (
            runId: number,
            lines: string[],
            r: RunResult,
            showWaiting: boolean,
            probePrefix?: string,
        ) => {
            const hasRealPrompts = !!inputPlan.prompts?.length;
            const syntheticPrompt = !hasRealPrompts;
            const promptsRaw = hasRealPrompts ? inputPlan.prompts : ["Input:"];

            const stdoutText = cleanTermText(r.stdout ?? "");
            const prefix =
                syntheticPrompt && probePrefix && stdoutText.startsWith(probePrefix)
                    ? probePrefix
                    : "";
            const rest = prefix ? stdoutText.slice(prefix.length) : stdoutText;

            const rebuilt: TermLine[] = [];

            if (syntheticPrompt) {
                const prefixLines = toOutTermLines(prefix);
                let startIdx = 0;

                if (prefix && !prefix.endsWith("\n") && lines.length > 0 && prefixLines.length > 0) {
                    const last = prefixLines[prefixLines.length - 1];
                    const joiner = last.text.endsWith(" ") || last.text === "" ? "" : " ";

                    prefixLines[prefixLines.length - 1] = {
                        ...last,
                        text: last.text + joiner + String(lines[0] ?? ""),
                    };

                    startIdx = 1;
                }

                rebuilt.push(...prefixLines);

                for (let i = startIdx; i < lines.length; i++) {
                    rebuilt.push({ type: "in", text: String(lines[i] ?? "") });
                }

                rebuilt.push(...toOutTermLines(rest));
            } else {
                const splitCount = showWaiting ? lines.length + 1 : lines.length;
                const promptsForSplit = expandPrompts(promptsRaw, Math.max(splitCount, 1), "Input:");
                const segs = splitStdoutByPrompts(stdoutText, promptsForSplit);

                rebuilt.push(...toOutTermLines(segs[0] ?? ""));

                for (let i = 0; i < lines.length; i++) {
                    const pDisp = prettyPrompt(
                        promptsForSplit[i] || promptsRaw[i] || promptsRaw[0] || "Input:",
                    );

                    rebuilt.push({ type: "in", text: `${pDisp} ${lines[i] ?? ""}` });

                    let seg = segs[i + 1] ?? "";
                    if (seg.startsWith(" ") && !seg.startsWith(" \n")) seg = seg.slice(1);
                    rebuilt.push(...toOutTermLines(seg));
                }
            }

            const extraErrs: TermLine[] = [];
            if (r.compile_output) extraErrs.push({ type: "err", text: cleanTermText(r.compile_output) });
            if (r.stderr) extraErrs.push({ type: "err", text: cleanTermText(r.stderr) });
            if (r.message) extraErrs.push({ type: "err", text: cleanTermText(r.message) });
            if (r.error && !isCanceledResult(r)) {
                extraErrs.push({ type: "err", text: cleanTermText(r.error) });
            }

            if (showWaiting) {
                setAwaitingInput(true);
                const nextRaw = promptsRaw[lines.length] || promptsRaw[0] || "Input:";
                setInputPrompt(syntheticPrompt ? "" : prettyPrompt(nextRaw));
                setRunState("awaiting_input");
                replaceRunLines(runId, rebuilt);
                return;
            }

            replaceRunLines(runId, [...rebuilt, ...extraErrs]);
            setAwaitingInput(false);
            setInputPrompt("");
            setRunState("idle");
        },
        [inputPlan.prompts, replaceRunLines],
    );

    const buildStaticTranscript = React.useCallback(
        (runId: number, lines: string[], r: RunResult) => {
            const stdoutText = cleanTermText(r.stdout ?? "");
            const strippedStdout = stripKnownStaticPrefix(
                stdoutText,
                staticPrePieces,
                inputPlan.prompts,
                lines,
            );

            const rebuilt: TermLine[] = [
                ...staticPreLines,
                ...buildPromptInputLines(lines),
                ...toOutTermLines(strippedStdout),
            ];

            if (r.compile_output) rebuilt.push({ type: "err", text: cleanTermText(r.compile_output) });
            if (r.stderr) rebuilt.push({ type: "err", text: cleanTermText(r.stderr) });
            if (r.message) rebuilt.push({ type: "err", text: cleanTermText(r.message) });
            if (r.error && !isCanceledResult(r)) {
                rebuilt.push({ type: "err", text: cleanTermText(r.error) });
            }

            replaceRunLines(runId, rebuilt);
            setAwaitingInput(false);
            setInputPrompt("");
            setRunState("idle");
        },
        [staticPrePieces, staticPreLines, inputPlan.prompts, buildPromptInputLines, replaceRunLines],
    );

    const cancelRun = React.useCallback(() => {
        if (runState !== "running" && runState !== "awaiting_input" && runState !== "starting") {
            return;
        }

        const runId = activeRunIdRef.current ?? runIdRef.current;

        if (!isSql) {
            appendSysLine("Run canceled.", runId);
        }

        clearInputUi();

        if (!busy || !abortRef.current) {
            setLastResult({
                ok: false,
                status: "Canceled",
                error: "Run canceled by user.",
            });
            activeRunIdRef.current = null;
            setRunState("idle");
            setBusy(false);
            return;
        }

        setRunState("canceling");
        abortActiveRun("user");
    }, [runState, busy, isSql, appendSysLine, clearInputUi, abortActiveRun]);

    const startRun = React.useCallback(async () => {
        if (disabled || runLockRef.current || busy || !allowRun) return;

        const runId = runIdRef.current + 1;

        try {
            setRunState("starting");

            if (resetTerminalOnRun) {
                resetTerminal();
                setRunState("starting");
            } else {
                clearInputUi();
                setLastResult(null);
                setStdinBuffer("");
                setTypedLines([]);
                probeStdoutRef.current = "";
            }

            setLastRunLanguage(lang);

            runIdRef.current = runId;
            activeRunIdRef.current = runId;

            if (isSql) {
                setTerminal([]);
                clearInputUi();

                const r = await runOnce("");
                if (!r) {
                    setRunState("idle");
                    return;
                }

                clearInputUi();
                replaceRunLines(runId, []);
                if (isCanceledResult(r)) {
                    setRunState("idle");
                    return;
                }

                setRunState("idle");
                return;
            }

            const expectsInput = inputPlan.expected > 0;

            if (!expectsInput) {
                replaceRunLines(runId, [{ type: "sys", text: "Processing...", runId }]);

                const r = await runOnce("");
                if (!r) {
                    clearInputUi();
                    setRunState("idle");
                    return;
                }
                if (isCanceledResult(r)) {
                    clearInputUi();
                    setRunState("idle");
                    return;
                }

                if (isProbeMode) {
                    rebuildProbeTranscript(runId, [], r, false);
                } else {
                    buildStaticTranscript(runId, [], r);
                }
                return;
            }

            if (isProbeMode) {
                replaceRunLines(runId, [{ type: "sys", text: "Processing...", runId }]);

                const r = await runOnce("");
                if (!r) {
                    clearInputUi();
                    setRunState("idle");
                    return;
                }
                if (isCanceledResult(r)) {
                    clearInputUi();
                    setRunState("idle");
                    return;
                }

                probeStdoutRef.current = cleanTermText(r.stdout ?? "");
                const more = needsMoreInput(lang, r);
                rebuildProbeTranscript(runId, [], r, more, probeStdoutRef.current);
                return;
            }

            setAwaitingInput(true);
            setInputPrompt(prettyPrompt(inputPlan.prompts[0] || "Input:"));
            setTypedLines([]);
            setStdinBuffer("");
            setRunState("awaiting_input");
            replaceRunLines(runId, staticPreLines);
        } catch (e) {
            const msg = errorMessage(e);
            clearInputUi();
            setLastResult({ ok: false, status: "Error", error: msg });
            setRunState("idle");
            if (!isSql) appendErrLine(msg, runId);
        }
    }, [
        disabled,
        busy,
        allowRun,
        resetTerminalOnRun,
        resetTerminal,
        clearInputUi,
        isSql,
        lang,
        inputPlan.expected,
        inputPlan.prompts,
        isProbeMode,
        runOnce,
        replaceRunLines,
        rebuildProbeTranscript,
        buildStaticTranscript,
        appendErrLine,
        staticPreLines,
    ]);

    const submitInput = React.useCallback(async () => {
        if (isSql || disabled || runLockRef.current || busy) return;

        const runId = activeRunIdRef.current;
        if (!runId) return;

        try {
            const typed = String(inputLine ?? "");
            const next = [...typedLines, typed];

            setTypedLines(next);
            setInputLine("");
            setStdinBuffer(next.join("\n") + "\n");

            const expectsInput = inputPlan.expected > 0;
            const hasRealPrompts = !!inputPlan.prompts?.length;
            const promptForThisInput = hasRealPrompts
                ? prettyPrompt(
                    inputPlan.prompts[Math.max(0, next.length - 1)] ||
                    inputPlan.prompts[0] ||
                    "Input:",
                )
                : "";

            if (isProbeMode) {
                appendImmediateInputLine(runId, typed, promptForThisInput);
                appendProcessingLine(runId);
            }

            if (expectsInput && !isProbeMode && next.length < inputPlan.expected) {
                const nextPrompt = prettyPrompt(
                    inputPlan.prompts[next.length] || inputPlan.prompts[0] || "Input:",
                );

                setAwaitingInput(true);
                setInputPrompt(nextPrompt);
                setRunState("awaiting_input");

                replaceRunLines(runId, [
                    ...staticPreLines,
                    ...buildPromptInputLines(next),
                ]);
                return;
            }

            const stdin = next.join("\n") + "\n";

            if (!isProbeMode) {
                clearInputUi();
            }

            setRunState("starting");

            if (!isProbeMode) {
                replaceRunLines(runId, [
                    ...staticPreLines,
                    ...buildPromptInputLines(next),
                    { type: "sys", text: "Processing...", runId },
                ]);
            }

            const r = await runOnce(stdin);
            if (!r) {
                clearInputUi();
                setRunState("idle");
                return;
            }
            if (isCanceledResult(r)) {
                clearInputUi();
                setRunState("idle");
                return;
            }

            if (isProbeMode) {
                const more = needsMoreInput(lang, r);
                rebuildProbeTranscript(runId, next, r, more, probeStdoutRef.current);
                return;
            }

            buildStaticTranscript(runId, next, r);
        } catch (e) {
            const msg = errorMessage(e);
            clearInputUi();
            setLastResult({ ok: false, status: "Error", error: msg });
            setRunState("idle");
            appendErrLine(msg, runId);
        }
    }, [
        isSql,
        disabled,
        busy,
        inputLine,
        typedLines,
        inputPlan.expected,
        inputPlan.prompts,
        isProbeMode,
        runOnce,
        rebuildProbeTranscript,
        buildStaticTranscript,
        buildPromptInputLines,
        appendErrLine,
        appendImmediateInputLine,
        appendProcessingLine,
        clearInputUi,
        replaceRunLines,
        staticPreLines,
    ]);

    return {
        stdinBuffer,
        terminal,
        awaitingInput,
        inputPrompt,
        inputLine,
        setInputLine,
        inputRef,
        busy,
        runState,
        canCancel: runState === "running" || runState === "awaiting_input" || runState === "starting",
        cancelRun,
        lastResult,
        lastRunLanguage,
        resetTerminal,
        startRun,
        submitInput,
        typedLines,
    };
}