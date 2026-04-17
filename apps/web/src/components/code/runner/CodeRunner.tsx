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
import {
    isControlled,
    type CodeRunnerProps,
    type TerminalDock,
    CodeRunnerFrame,
} from "./types";
import HeaderBar from "./components/HeaderBar";
import EditorPane from "./components/EditorPane";
import { useSplitSizing } from "./hooks/useSplitSizing";
import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";
import { isSqlRunResult } from "@/lib/code/types";
import { runViaApi } from "@/lib/code/runClient";
import { useCodeRunnerController } from "@/components/code/runner/hooks/controller/useCodeRunnerController";
import { resolveRuntime } from "@/components/code/runner/hooks/controller/useResolvedRuntime";
import TerminalSurface from "@/components/code/runner/components/TerminalSurface";
import XtermTerminal from "@/components/code/runner/components/XtermTerminal";
import { useWorkspaceTerminalController } from "@/components/code/runner/hooks/pty/useWorkspaceTerminalController";
import type { WorkspaceTerminalConfig } from "@/components/code/runner/runtime";
import { cx } from "@/components/tools/utils/cx";

type MobilePane = "editor" | "output";
type OutputTab = "output" | "terminal";

type CodeRunnerWithStdinProps = CodeRunnerProps & {
    stdin?: string;
    initialStdin?: string;
    onChangeStdin?: (value: string) => void;
    showStdinEditor?: boolean;
    stdinPlaceholder?: string;
    workspaceTerminal?: WorkspaceTerminalConfig;
    onSyncWorkspaceFiles?: (sessionId: string) => Promise<boolean>;
    sqlInitialTableSnapshots?: Record<
        string,
        {
            name: string;
            columns: Array<{ name: string; type?: string | null }>;
            rows: unknown[][];
            rowCount: number;
        }
    >;
};

const RUNNER_SURFACE =
    "overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50/60 dark:border-white/10 dark:bg-black/20";

const PANEL_EDITOR = "bg-white/80 dark:bg-black/10";

const PANEL_TABS =
    "border-b border-neutral-200 bg-white/88 dark:border-white/10 dark:bg-black/25";

const MOBILE_TAB_BASE =
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors";

const MOBILE_TAB_IDLE =
    "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white/90";

const MOBILE_TAB_ACTIVE =
    "border border-neutral-300 bg-neutral-100 text-neutral-900 dark:border-white/15 dark:bg-white/[0.08] dark:text-white/90";

const MOBILE_TAB_OUTPUT_ACTIVE =
    "border border-sky-300/20 bg-sky-300/10 text-sky-900 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-100";

const SPLIT_BAR_IDLE =
    "bg-neutral-200/50 outline-none dark:bg-white/[0.04] dark:hover:bg-white/[0.09] dark:focus:bg-white/[0.09]";

const SPLIT_BAR_ACTIVE = "hover:bg-neutral-300/60 focus:bg-neutral-300/60";

function CodeRunnerContent(props: CodeRunnerWithStdinProps) {
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
        isAuthenticated,

        stdin: controlledStdin,
        initialStdin,
        onChangeStdin,
        showStdinEditor = false,
        sqlInitialTableSnapshots,
        stdinPlaceholder = "Type stdin here. Each new line becomes one input line.",
        workspaceTerminal,


        onSyncWorkspaceFiles,
    } = props as any;

    const controlled = isControlled(props as any);
    const runtime = resolveRuntime((props as any).runtime);

    const { resolvedTheme } = useTheme();
    const [editorTheme, setEditorTheme] = useState<"vs" | "vs-dark">("vs-dark");
    const [isNarrowScreen, setIsNarrowScreen] = useState(false);
    const [mobilePane, setMobilePane] = useState<MobilePane>("editor");
    const [outputTab, setOutputTab] = useState<OutputTab>("output");

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

    const [uStdin, setUStdin] = useState<string>(
        typeof initialStdin === "string" ? initialStdin : "",
    );

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

    const stdinControlled = typeof controlledStdin === "string";
    const stdin: string = stdinControlled ? String(controlledStdin ?? "") : uStdin;

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

    const setStdin = (value: string) => {
        if (typeof onChangeStdin === "function") onChangeStdin(value);
        if (!stdinControlled) setUStdin(value);
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

    const term = useCodeRunnerController({
        runtime,
        lang,
        code,
        stdin,
        sqlDialect,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlDatasetId,
        disabled,
        allowRun,
        resetTerminalOnRun,
        isAuthenticated,
        onRun: onRun ?? defaultOnRun,
    } as any);

    const workspaceTerminalEnabled =
        Boolean(workspaceTerminal?.enabled) &&
        isAuthenticated === true &&
        lang !== "sql";

    const workspaceTerm = useWorkspaceTerminalController({
        enabled: workspaceTerminalEnabled,
        projectId: workspaceTerminal?.projectId,
        cwd: workspaceTerminal?.cwd,
        initialFiles: workspaceTerminal?.initialFiles,
        lazy: workspaceTerminal?.lazy ?? true,
        title: workspaceTerminal?.title,
    });

    const [isSyncingWorkspace, setIsSyncingWorkspace] = useState(false);

    const handleSyncWorkspace = useCallback(async () => {
        if (!workspaceTerm.sessionId || !onSyncWorkspaceFiles) return;

        try {
            setIsSyncingWorkspace(true);
            await onSyncWorkspaceFiles(workspaceTerm.sessionId);
        } finally {
            setIsSyncingWorkspace(false);
        }
    }, [workspaceTerm.sessionId, onSyncWorkspaceFiles]);

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
        if (!workspaceTerminalEnabled && outputTab === "terminal") {
            setOutputTab("output");
        }
    }, [workspaceTerminalEnabled, outputTab]);

    useEffect(() => {
        if (lang === "sql" && outputTab === "terminal") {
            setOutputTab("output");
        }
    }, [lang, outputTab]);

    useEffect(() => {
        if (outputTab !== "terminal") return;
        if (!workspaceTerminalEnabled) return;
        if (workspaceTerm.started || workspaceTerm.starting) return;

        void workspaceTerm.open();
    }, [
        outputTab,
        workspaceTerminalEnabled,
        workspaceTerm,
    ]);

    useEffect(() => {
        if (!isNarrowScreen) return;
        if (!showEditor || !showTerminal) return;
        if (term.runState !== "idle") {
            setMobilePane("output");
            setOutputTab("output");
        }
    }, [isNarrowScreen, showEditor, showTerminal, term.runState]);

    const onSwitchLang = React.useCallback(
        (next: CodeLanguage) => {
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

            setOutputTab("output");
            term.resetTerminal();
        },
        [
            fixedLanguage,
            allowedLangs,
            lang,
            preserveCodeOnLanguageSwitch,
            controlled,
            isNarrowScreen,
            showEditor,
            showTerminal,
            term,
        ],
    );

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

    const outputLabel = term.backend === "sql" ? "Results" : "Output";
    const mobileTabAttention = term.runState !== "idle" || !!term.lastResult;
    const mobileBodyHeight = Math.max(240, (split.mainH || numericHeight) - 48);

    const showStdinEditorUI = showStdinEditor && showEditor && lang !== "sql";
    const showWorkspaceTerminalTab = workspaceTerminalEnabled;

    const renderOutputBody = () => {
        if (outputTab === "terminal" && showWorkspaceTerminalTab) {
            return (
                <XtermTerminal
                    terminalFeed={workspaceTerm.terminalFeed}
                    inputEnabled={workspaceTerm.inputEnabled}
                    busy={workspaceTerm.busy}
                    disabled={disabled}
                    lastResult={null}
                    onSendData={workspaceTerm.sendData}
                    onResize={workspaceTerm.resize}
                />
            );
        }

        return (
            <TerminalSurface
                controller={term}
                disabled={disabled}
                sqlSchemaSql={sqlSchemaSql ?? sqlSetupSql ?? ""}
                sqlInitialTableSnapshots={sqlInitialTableSnapshots}
                sqlViewKey={[
                    editorModelKey ?? "",
                    sqlDatasetId ?? "",
                    lang,
                    sqlDialect,
                ].join("::")}
            />
        );
    };

    const renderOutputPane = (panelHeight?: number, panelWidth?: number) => {
        return (
            <div
                className="min-h-0 flex flex-col"
                style={{
                    ...(typeof panelHeight === "number" ? { height: panelHeight } : {}),
                    ...(typeof panelWidth === "number" ? { width: panelWidth } : {}),
                }}
            >
                {showWorkspaceTerminalTab ? (
                    <div className={cx("p-2", PANEL_TABS)}>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setOutputTab("output")}
                                className={cx(
                                    MOBILE_TAB_BASE,
                                    outputTab === "output" ? MOBILE_TAB_OUTPUT_ACTIVE : MOBILE_TAB_IDLE,
                                )}
                                aria-pressed={outputTab === "output"}
                            >
                                {outputLabel}
                                {mobileTabAttention && outputTab !== "output" ? (
                                    <span className="inline-flex h-2 w-2 rounded-full bg-sky-500" />
                                ) : null}
                            </button>

                            <button
                                type="button"
                                onClick={() => setOutputTab("terminal")}
                                className={cx(
                                    MOBILE_TAB_BASE,
                                    outputTab === "terminal" ? MOBILE_TAB_ACTIVE : MOBILE_TAB_IDLE,
                                )}
                                aria-pressed={outputTab === "terminal"}
                            >
                                <span>{workspaceTerminal?.title ?? "Terminal"}</span>
                                {(workspaceTerm.started || workspaceTerm.busy || workspaceTerm.starting) ? (
                                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                ) : null}
                            </button>

                            {outputTab === "terminal" &&
                            workspaceTerm.sessionId &&
                            onSyncWorkspaceFiles ? (
                                <button
                                    type="button"
                                    onClick={() => void handleSyncWorkspace()}
                                    disabled={isSyncingWorkspace}
                                    className={cx(
                                        MOBILE_TAB_BASE,
                                        MOBILE_TAB_IDLE,
                                        "ml-auto border border-neutral-200 dark:border-white/10",
                                    )}
                                >
                                    {isSyncingWorkspace ? "Syncing…" : "Sync Files"}
                                </button>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-hidden">
                    {renderOutputBody()}
                </div>
            </div>
        );
    };

    const renderEditorPane = (editorHeight: number) => (
        <div
            className={PANEL_EDITOR}
            style={{ touchAction: isNarrowScreen ? "pan-y" : "auto", height: "100%" }}
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
                            setOutputTab("output");
                            term.resetTerminal();
                            if (isNarrowScreen && showEditor && showTerminal) {
                                setMobilePane("editor");
                            }
                        }}
                        allowRun={allowRun}
                        onRun={async () => {
                            setOutputTab("output");

                            if (isNarrowScreen && showEditor && showTerminal) {
                                setMobilePane("output");
                            }

                            await onBeforeRun?.();
                            await term.startRun();
                        }}
                    />
                </div>
            ) : null}

            {showHint && hintMarkdown ? (
                <div className={frame === "plain" ? "mt-3" : "ui-soft mt-3 p-3"}>
                    <MathMarkdown className="ui-math" content={hintMarkdown} />
                </div>
            ) : null}

            {showStdinEditorUI ? (
                <div className={frame === "plain" ? "mt-3" : "mt-3"}>
                    <div className="rounded-xl border border-neutral-200 bg-white/80 p-3 dark:border-white/10 dark:bg-black/10">
                        <div className="text-xs font-medium text-neutral-700 dark:text-white/75">
                            Stdin
                        </div>
                        <div className="mt-1 text-[11px] text-neutral-500 dark:text-white/45">
                            Each new line is passed as one input line.
                        </div>

                        <textarea
                            value={stdin}
                            onChange={(e) => setStdin(e.target.value)}
                            placeholder={stdinPlaceholder}
                            disabled={disabled || term.busy}
                            rows={4}
                            className="mt-3 min-h-[88px] w-full resize-y rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-900 outline-none transition focus:border-neutral-300 dark:border-white/10 dark:bg-black/20 dark:text-white/90 dark:focus:border-white/15"
                        />
                    </div>
                </div>
            ) : null}

            {showEditor || showTerminal ? (
                <div
                    ref={mainRef}
                    style={regionStyle}
                    className={[
                        "relative z-0 mt-3 min-h-0",
                        RUNNER_SURFACE,
                        isNarrowScreen ? "overscroll-y-auto touch-pan-y" : "overscroll-contain",
                        height === "auto" ? "h-auto" : "",
                    ].join(" ")}
                >
                    {showEditor && !showTerminal ? renderEditorPane(numericHeight) : null}

                    {!showEditor && showTerminal ? renderOutputPane() : null}

                    {showEditor && showTerminal ? (
                        isNarrowScreen ? (
                            <div className="flex h-full min-h-0 flex-col">
                                <div className={cx("p-2", PANEL_TABS)}>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMobilePane("editor")}
                                            className={cx(
                                                MOBILE_TAB_BASE,
                                                mobilePane === "editor" ? MOBILE_TAB_ACTIVE : MOBILE_TAB_IDLE,
                                            )}
                                            aria-pressed={mobilePane === "editor"}
                                        >
                                            Editor
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setMobilePane("output")}
                                            className={cx(
                                                MOBILE_TAB_BASE,
                                                mobilePane === "output"
                                                    ? MOBILE_TAB_OUTPUT_ACTIVE
                                                    : MOBILE_TAB_IDLE,
                                            )}
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
                                <div
                                    className={cx(
                                        "min-h-0 border-b border-neutral-200 dark:border-white/10",
                                        PANEL_EDITOR,
                                    )}
                                >
                                    {renderEditorPane(split.bottomEditorH)}
                                </div>

                                <div
                                    {...split.separatorProps}
                                    aria-disabled={term.runState !== "idle"}
                                    onPointerDown={
                                        term.runState !== "idle" ? undefined : split.onPointerDownSplit
                                    }
                                    onKeyDown={
                                        term.runState !== "idle" ? undefined : split.separatorProps.onKeyDown
                                    }
                                    className={[
                                        "h-[6px]",
                                        SPLIT_BAR_IDLE,
                                        term.runState !== "idle"
                                            ? "cursor-not-allowed opacity-60"
                                            : `cursor-row-resize ${SPLIT_BAR_ACTIVE}`,
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
                                <div
                                    className={cx(
                                        "min-w-0 flex-1 border-r border-neutral-200 dark:border-white/10",
                                        PANEL_EDITOR,
                                    )}
                                >
                                    {renderEditorPane(split.rightTotalH)}
                                </div>

                                <div
                                    {...split.separatorProps}
                                    aria-disabled={term.runState !== "idle"}
                                    onPointerDown={
                                        term.runState !== "idle" ? undefined : split.onPointerDownSplit
                                    }
                                    onKeyDown={
                                        term.runState !== "idle" ? undefined : split.separatorProps.onKeyDown
                                    }
                                    className={[
                                        "w-[6px]",
                                        SPLIT_BAR_IDLE,
                                        term.runState !== "idle"
                                            ? "cursor-not-allowed opacity-60"
                                            : `cursor-col-resize ${SPLIT_BAR_ACTIVE}`,
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

export default function CodeRunner(props: CodeRunnerWithStdinProps) {
    return <CodeRunnerContent {...props} />;
}