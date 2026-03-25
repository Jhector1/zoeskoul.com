"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import MathMarkdown from "@/components/markdown/MathMarkdown";

import {
    DEFAULT_CODE,
    DEFAULT_LANGS,
    DEFAULT_SQL_DIALECT,
    DEFAULT_SQL_DIALECTS,
} from "./constants";
import {isControlled, type CodeRunnerProps, type TerminalDock, CodeRunnerFrame} from "./types";
import HeaderBar from "./components/HeaderBar";
import EditorPane from "./components/EditorPane";
import TerminalPane from "./components/TerminalPane";
import SqlResultsPane from "./components/SqlResultsPane";
import { useSplitSizing } from "./hooks/useSplitSizing";
// import { useTerminalRunner } from "./hooks/useTerminalRunner";
import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";
import { isSqlRunResult } from "@/lib/code/types";
import { runViaApi } from "@/lib/code/runClient";
import {useCodeRunnerController} from "@/components/code/runner/hooks/useCodeRunnerController";

type MobilePane = "editor" | "output";

function CodeRunnerContent(props: CodeRunnerProps) {
    const {
        frame = "card" as CodeRunnerFrame,
        title = "Try it",
        height = 320,
        hintMarkdown,

        preserveCodeOnLanguageSwitch = true,

        showHeaderBar = true,
        showEditor = true,
        showTerminal = true,
        showHint = true,

        fixedLanguage,
        allowedLanguages,
        showLanguagePicker = true,

        fixedSqlDialect,
        allowedSqlDialects,
        showSqlDialectPicker = true,

        allowReset = true,
        allowRun = true,
        disabled = false,

        resetTerminalOnRun = true,

        showEditorThemeToggle = true,
        showTerminalDockToggle = true,
        fixedTerminalDock,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlDatasetId,
        onRun,
        editorModelKey,
        onBeforeRun,
    } = props as any;

    const controlled = isControlled(props);

    const { resolvedTheme } = useTheme();
    const [editorTheme, setEditorTheme] = useState<"vs" | "vs-dark">("vs-dark");
    const [isNarrowScreen, setIsNarrowScreen] = useState(false);
    const [mobilePane, setMobilePane] = useState<MobilePane>("editor");

    useEffect(() => {
        if (!showEditorThemeToggle) {
            setEditorTheme(resolvedTheme === "dark" ? "vs-dark" : "vs");
        }
    }, [resolvedTheme, showEditorThemeToggle]);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;

        const mq = window.matchMedia("(max-width: 767px)");
        const update = () => setIsNarrowScreen(mq.matches);

        update();

        if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", update);
            return () => mq.removeEventListener("change", update);
        }

        mq.addListener(update);
        return () => mq.removeListener(update);
    }, []);

    const allowedLangs = useMemo(() => {
        const base = allowedLanguages?.length ? allowedLanguages : DEFAULT_LANGS;
        if (fixedLanguage) return [fixedLanguage];
        return base;
    }, [allowedLanguages, fixedLanguage]);

    const allowedDialects = useMemo(() => {
        const base = allowedSqlDialects?.length ? allowedSqlDialects : DEFAULT_SQL_DIALECTS;
        if (fixedSqlDialect) return [fixedSqlDialect];
        return base;
    }, [allowedSqlDialects, fixedSqlDialect]);

    const initialLang: CodeLanguage =
        fixedLanguage ??
        (controlled ? (props as any).language : (props as any).initialLanguage) ??
        allowedLangs[0] ??
        "python";

    const [uLang, setULang] = useState<CodeLanguage>(initialLang);

    const [uCode, setUCode] = useState<string>(
        typeof (props as any).initialCode === "string"
            ? (props as any).initialCode
            : DEFAULT_CODE[initialLang],
    );

    const initialSqlDialect: SqlDialect =
        fixedSqlDialect ??
        (controlled ? (props as any).sqlDialect : (props as any).initialSqlDialect) ??
        allowedDialects[0] ??
        DEFAULT_SQL_DIALECT;

    const [uSqlDialect, setUSqlDialect] = useState<SqlDialect>(initialSqlDialect);

    const lang: CodeLanguage = fixedLanguage
        ? fixedLanguage
        : controlled
            ? (props as any).language
            : uLang;

    const code: string = controlled ? ((props as any).code ?? "") : uCode;

    const sqlDialect: SqlDialect = fixedSqlDialect
        ? fixedSqlDialect
        : controlled
            ? ((props as any).sqlDialect ?? uSqlDialect)
            : uSqlDialect;

    const setLang = (l: CodeLanguage) => {
        if (fixedLanguage) return;
        if (!allowedLangs.includes(l)) return;
        controlled ? (props as any).onChangeLanguage(l) : setULang(l);
    };

    const setCode = (c: string) => {
        controlled ? (props as any).onChangeCode(c) : setUCode(c);
    };

    const setSqlDialect = (d: SqlDialect) => {
        if (fixedSqlDialect) return;
        if (!allowedDialects.includes(d)) return;

        const cb = (props as any).onChangeSqlDialect as ((d: SqlDialect) => void) | undefined;
        if (cb) cb(d);
        else setUSqlDialect(d);
    };

    const [uDock, setUDock] = useState<TerminalDock>(
        (props as any).initialTerminalDock ?? "bottom",
    );

    const requestedDock: TerminalDock =
        fixedTerminalDock ?? (props as any).terminalDock ?? uDock;

    const effectiveDock: TerminalDock = isNarrowScreen ? "bottom" : requestedDock;

    const setDock = (d: TerminalDock) => {
        if (fixedTerminalDock) return;
        if (isNarrowScreen) {
            setUDock("bottom");
            return;
        }

        const cb = (props as any).onChangeTerminalDock as ((d: TerminalDock) => void) | undefined;
        if (cb) cb(d);
        else setUDock(d);
    };

    const monacoEditorRef = useRef<any>(null);

    const requestLayout = () => {
        const ed = monacoEditorRef.current;
        if (!ed) return;
        requestAnimationFrame(() => {
            try {
                ed.layout?.();
            } catch {}
        });
    };

    const mainRef = useRef<HTMLDivElement | null>(null);
    const numericHeight = typeof height === "number" ? height : 320;

    const split = useSplitSizing({
        height: numericHeight,
        showEditor,
        showTerminal,
        dock: effectiveDock,
        disabled,
        initialTerminalSize: (props as any).initialTerminalSize ?? 240,
        mainRef,
        requestLayout,
    });

    const defaultOnRun = useCallback((args: any) => {
        if (args.language === "sql") {
            return runViaApi(
                {
                    kind: "sql",
                    language: "sql",
                    dialect: args.sqlDialect,
                    code: args.code,
                    schemaSql: args.sqlSchemaSql ?? args.setupSql,
                    seedSql: args.sqlSeedSql,
                    datasetId: args.datasetId,
                },
                args.signal,
            );
        }

        return runViaApi(
            {
                kind: "code",
                language: args.language,
                code: args.code,
                stdin: args.stdin,
            },
            args.signal,
        );
    }, []);

    // const term = useTerminalRunner({
    //     lang,
    //     code,
    //     sqlDialect,
    //     sqlSchemaSql,
    //     sqlSeedSql,
    //     sqlSetupSql,
    //     sqlDatasetId,
    //     disabled,
    //     allowRun,
    //     resetTerminalOnRun,
    //     onRun: onRun ?? defaultOnRun,
    // });
    const term = useCodeRunnerController({
        lang,
        code,
        sqlDialect,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlDatasetId,
        disabled,
        allowRun,
        resetTerminalOnRun,onRun
    });
    useEffect(() => {
        requestLayout();
    }, [effectiveDock, split.termW, split.bottomEditorH, split.bottomTermH, split.rightTotalH]);

    useEffect(() => {
        if (!showEditor && showTerminal) {
            setMobilePane("output");
            return;
        }
        if (showEditor && !showTerminal) {
            setMobilePane("editor");
        }
    }, [showEditor, showTerminal]);

    useEffect(() => {
        if (!isNarrowScreen) return;
        if (!showEditor || !showTerminal) return;
        if (term.runState !== "idle") {
            setMobilePane("output");
        }
    }, [isNarrowScreen, showEditor, showTerminal, term.runState]);

    const onSwitchLang = React.useCallback((next: CodeLanguage) => {
        if (fixedLanguage) return;
        if (!allowedLangs.includes(next)) return;
        if (next === lang) return;

        setLang(next);

        if (!preserveCodeOnLanguageSwitch && !controlled) {
            setCode(DEFAULT_CODE[next]);
        }

        if (isNarrowScreen && showEditor && showTerminal) {
            setMobilePane("editor");
        }

        term.resetTerminal();
    }, [
        fixedLanguage,
        allowedLangs,
        lang,
        preserveCodeOnLanguageSwitch,
        controlled,
        setLang,
        setCode,
        term,
        isNarrowScreen,
        showEditor,
        showTerminal,
    ]);

    const showPickerUI = showLanguagePicker && !fixedLanguage && allowedLangs.length > 1;
    const showSqlDialectPickerUI =
        lang === "sql" &&
        showSqlDialectPicker &&
        !fixedSqlDialect &&
        allowedDialects.length > 1;

    const showEditorThemeToggleUI = showEditorThemeToggle && showHeaderBar;

    const showDockToggleUI =
        !isNarrowScreen &&
        showTerminalDockToggle &&
        !fixedTerminalDock &&
        showHeaderBar &&
        showEditor &&
        showTerminal;

    const outerCls = frame === "plain" ? "w-full" : "ui-card w-full p-4";

    const regionStyle: React.CSSProperties | undefined =
        typeof height === "number"
            ? {
                height: isNarrowScreen ? `min(${numericHeight}px, 78dvh)` : numericHeight,
            }
            : undefined;

    const sqlResult =
        lang === "sql" &&
        term.lastRunLanguage === "sql" &&
        isSqlRunResult(term.lastResult)
            ? term.lastResult
            : null;

    const genericSqlError =
        lang === "sql" &&
        term.lastRunLanguage === "sql" &&
        term.lastResult &&
        !isSqlRunResult(term.lastResult)
            ? term.lastResult
            : null;

    const outputLabel = lang === "sql" ? "Results" : "Terminal";
    const mobileTabAttention = term.runState !== "idle" || !!term.lastResult;
    const mobileBodyHeight = Math.max(240, (split.mainH || numericHeight) - 52);

    const renderOutputPane = (panelHeight?: number, panelWidth?: number) => {
        if (lang === "sql") {
            return (
                <div
                    className="min-h-0 p-2 sm:p-3"
                    style={{
                        ...(typeof panelHeight === "number" ? { height: panelHeight } : {}),
                        ...(typeof panelWidth === "number" ? { width: panelWidth } : {}),
                    }}
                >
                    {genericSqlError ? (
                        <div className="rounded-2xl border border-rose-300/30 bg-rose-50/70 p-4 text-sm text-rose-700 dark:border-rose-300/20 dark:bg-rose-950/20 dark:text-rose-200">
                            <div className="font-black">SQL run error</div>
                            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
                                {genericSqlError.error ?? genericSqlError.status ?? "SQL run failed."}
                            </pre>
                        </div>
                    ) : (
                        <SqlResultsPane result={sqlResult} busy={term.busy} />
                    )}
                </div>
            );
        }

        return (
            <div
                className="min-h-0 p-2 sm:p-3"
                style={{
                    ...(typeof panelHeight === "number" ? { height: panelHeight } : {}),
                    ...(typeof panelWidth === "number" ? { width: panelWidth } : {}),
                }}
            >
                <TerminalPane
                    terminal={term.terminal}
                    stdinBuffer={term.stdinBuffer}
                    awaitingInput={term.awaitingInput}
                    inputPrompt={term.inputPrompt}
                    inputLine={term.inputLine}
                    setInputLine={term.setInputLine}
                    inputRef={term.inputRef}
                    busy={term.busy}
                    disabled={disabled}
                    lastResult={term.lastResult}
                    onSubmitInput={term.submitInput}
                    typedLines={term.typedLines}
                />
            </div>
        );
    };

    const renderEditorPane = (editorHeight: number) => (
        <div
            className="h-full bg-white/70 dark:bg-black/10"
            style={{ touchAction: isNarrowScreen ? "pan-y" : "auto" }}
        >
            <EditorPane
                frame={frame}
                lang={lang}
                mobileEditMode="auto"
                code={code}
                onChange={setCode}
                theme={editorTheme}
                height={editorHeight}
                disabled={disabled || term.busy}
                modelKey={editorModelKey}
                onMount={(ed) => {
                    monacoEditorRef.current = ed;
                    requestLayout();
                }}
            />
        </div>
    );

    return (
        <div className={outerCls}>
            {showHeaderBar ? (
                <div className="relative z-20 overflow-visible @container">
                    <HeaderBar
                        title={title}
                        disabled={disabled}
                        busy={term.busy}
                        runState={term.runState}
                        onCancel={term.cancelRun}
                        editorTheme={editorTheme}
                        onToggleTheme={() =>
                            setEditorTheme((t) => (t === "vs-dark" ? "vs" : "vs-dark"))
                        }
                        showEditorThemeToggle={showEditorThemeToggleUI}
                        dock={effectiveDock}
                        onToggleDock={() =>
                            setDock(effectiveDock === "bottom" ? "right" : "bottom")
                        }
                        showDockToggle={showDockToggleUI}
                        showPicker={showPickerUI}
                        allowedLangs={allowedLangs}
                        lang={lang}
                        onSwitchLang={onSwitchLang}
                        showSqlDialectPicker={showSqlDialectPickerUI}
                        allowedSqlDialects={allowedDialects}
                        sqlDialect={sqlDialect}
                        onSwitchSqlDialect={setSqlDialect}
                        allowReset={allowReset}
                        onReset={() => {
                            setCode(DEFAULT_CODE[lang]);
                            term.resetTerminal();
                            if (isNarrowScreen && showEditor && showTerminal) {
                                setMobilePane("editor");
                            }
                        }}
                        allowRun={allowRun}
                        onRun={async () => {
                            if (isNarrowScreen && showEditor && showTerminal) {
                                setMobilePane("output");
                            }

                            await onBeforeRun?.();
                            term.startRun();
                        }}
                    />
                </div>
            ) : null}

            {showHint && hintMarkdown ? (
                <div className={frame === "plain" ? "mt-3" : "ui-soft mt-3 p-3"}>
                    <MathMarkdown className="ui-math" content={hintMarkdown} />
                </div>
            ) : null}

            {showEditor || showTerminal ? (
                <div
                    ref={mainRef}
                    style={regionStyle}
                    className={[
                        "relative z-0",
                        "mt-3 overflow-hidden rounded-xl border sm:rounded-2xl",
                        "border-neutral-200 bg-neutral-50/60",
                        "dark:border-white/10 dark:bg-black/20",
                        "min-h-0",
                        isNarrowScreen ? "overscroll-y-auto touch-pan-y" : "overscroll-contain",
                        height === "auto" ? "h-auto" : "",
                    ].join(" ")}
                >
                    {showEditor && !showTerminal ? renderEditorPane(numericHeight) : null}

                    {!showEditor && showTerminal ? renderOutputPane() : null}

                    {showEditor && showTerminal ? (
                        isNarrowScreen ? (
                            <div className="flex h-full min-h-0 flex-col">
                                <div className="border-b border-neutral-200 bg-white/85 p-2 dark:border-white/10 dark:bg-black/25">
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMobilePane("editor")}
                                            className={[
                                                "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-extrabold transition",
                                                mobilePane === "editor"
                                                    ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white/90"
                                                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/75 dark:hover:bg-white/[0.10]",
                                            ].join(" ")}
                                            aria-pressed={mobilePane === "editor"}
                                        >
                                            Editor
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setMobilePane("output")}
                                            className={[
                                                "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-extrabold transition",
                                                mobilePane === "output"
                                                    ? "border-sky-300/30 bg-sky-300/10 text-neutral-900 dark:text-white/90"
                                                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/75 dark:hover:bg-white/[0.10]",
                                            ].join(" ")}
                                            aria-pressed={mobilePane === "output"}
                                        >
                                            <span>{outputLabel}</span>
                                            {mobileTabAttention ? (
                                                <span className="inline-flex h-2 w-2 rounded-full bg-sky-500" />
                                            ) : null}
                                        </button>
                                    </div>
                                </div>

                                <div className="min-h-0 flex-1 overflow-hidden">
                                    {mobilePane === "editor"
                                        ? renderEditorPane(mobileBodyHeight)
                                        : renderOutputPane(mobileBodyHeight)}
                                </div>
                            </div>
                        ) : effectiveDock === "bottom" ? (
                            <div className="flex h-full min-h-0 flex-col">
                                <div className="min-h-0 border-b border-neutral-200 bg-white/70 dark:border-white/10 dark:bg-black/10">
                                    {renderEditorPane(split.bottomEditorH)}
                                </div>

                                <div
                                    {...split.separatorProps}
                                    aria-disabled={term.runState !== "idle"}
                                    onPointerDown={
                                        term.runState !== "idle"
                                            ? undefined
                                            : split.onPointerDownSplit
                                    }
                                    onKeyDown={
                                        term.runState !== "idle"
                                            ? undefined
                                            : split.separatorProps.onKeyDown
                                    }
                                    className={[
                                        "h-2 bg-neutral-200/60 outline-none dark:bg-white/5",
                                        term.runState !== "idle"
                                            ? "cursor-not-allowed opacity-60"
                                            : "cursor-row-resize hover:bg-neutral-200 focus:bg-neutral-200 dark:hover:bg-white/10 dark:focus:bg-white/10",
                                    ].join(" ")}
                                    title={
                                        term.runState !== "idle"
                                            ? "Cannot resize while a run session is active"
                                            : "Drag or use arrow keys to resize terminal"
                                    }
                                />

                                {renderOutputPane(split.bottomTermH)}
                            </div>
                        ) : (
                            <div className="flex h-full min-h-0">
                                <div className="min-w-0 flex-1 border-r border-neutral-200 bg-white/70 dark:border-white/10 dark:bg-black/10">
                                    {renderEditorPane(split.rightTotalH)}
                                </div>

                                <div
                                    {...split.separatorProps}
                                    aria-disabled={term.runState !== "idle"}
                                    onPointerDown={
                                        term.runState !== "idle"
                                            ? undefined
                                            : split.onPointerDownSplit
                                    }
                                    onKeyDown={
                                        term.runState !== "idle"
                                            ? undefined
                                            : split.separatorProps.onKeyDown
                                    }
                                    className={[
                                        "w-2 bg-neutral-200/60 outline-none dark:bg-white/5",
                                        term.runState !== "idle"
                                            ? "cursor-not-allowed opacity-60"
                                            : "cursor-col-resize hover:bg-neutral-200 focus:bg-neutral-200 dark:hover:bg-white/10 dark:focus:bg-white/10",
                                    ].join(" ")}
                                    title={
                                        term.runState !== "idle"
                                            ? "Cannot resize while a run session is active"
                                            : "Drag or use arrow keys to resize terminal"
                                    }
                                />

                                {renderOutputPane(split.rightTotalH, split.termW)}
                            </div>
                        )
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

export default function CodeRunner(props: CodeRunnerProps) {
    return <CodeRunnerContent {...props} />;
}