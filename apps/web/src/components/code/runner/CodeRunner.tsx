"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import MathMarkdown from "@/components/markdown/MathMarkdown";

import {
    DEFAULT_CODE,
    DEFAULT_LANGS,
    DEFAULT_SQL_DIALECT,
    DEFAULT_SQL_DIALECTS,
} from "@/components/code/runner/constants";
import {
    isControlled,
    type CodeRunnerProps,
    type TerminalDock,
    CodeRunnerFrame,
} from "@/components/code/runner/types";
// import HeaderBar from "./runner/components/HeaderBar";
import EditorPane from "@/components/code/runner/components/EditorPane";
import OutputSurface, {
    type OutputSurfaceModel,
} from "@/components/code/runner/components/OutputSurface";
import { useSplitSizing } from "@/components/code/runner/hooks/useSplitSizing";
import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import { runViaApi } from "@/lib/code/runClient";
import { useCodeRunnerController } from "@/components/code/runner/hooks/controller/useCodeRunnerController";
import { resolveRuntime } from "@/components/code/runner/hooks/controller/useResolvedRuntime";
import XtermTerminal from "@/components/code/runner/components/XtermTerminal";
import { useWorkspaceTerminalController } from "@/components/code/runner/hooks/pty/useWorkspaceTerminalController";
import type { WorkspaceSyncEntry, WorkspaceTerminalConfig } from "@/components/code/runner/runtime";
import { WorkspaceStateV2 } from "@/components/ide/types";
import { cx } from "@/components/tools/utils/cx";
import HeaderBar from "@/components/code/runner/components/HeaderBar";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import { resolveEditableWorkspaceFileId } from "@/components/code/runner/workspaceEditing";

type MobilePane = "editor" | "output";
type OutputTab = "output" | "terminal";

type CodeRunnerWithStdinProps = CodeRunnerProps & {
    stdin?: string;
    initialStdin?: string;
    onChangeStdin?: (value: string) => void;
    onChangeWorkspace?: (workspace: WorkspaceStateV2) => void;
    showStdinEditor?: boolean;
    stdinPlaceholder?: string;
    workspaceTerminal?: WorkspaceTerminalConfig;
    webPreviewEntries?: WorkspaceSyncEntry[];

    /**
     * Stable selectors for browser tests.
     * These should not affect runtime behavior.
     */
    testId?: string;
    editorTestId?: string;
    stdinTestId?: string;
    outputTestId?: string;
    mobileEditorTabTestId?: string;
    mobileOutputTabTestId?: string;

    sqlInitialTableSnapshots?: Record<
        string,
        {
            name: string;
            columns: Array<{ name: string; type?: string | null }>;
            rows: unknown[][];
            rowCount: number;
        }
    >;
    sqlPaneOptions?: SqlPaneOptions;
};

const RUNNER_SURFACE =
    "overflow-hidden border border-neutral-200 bg-neutral-50/60 dark:border-white/10 dark:bg-black/20";

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
        sqlResultShape,
        onRun,
        editorModelKey,
        toolScopeKey,
        exerciseStateKey,
        workspace,
        onBeforeRun,
        isAuthenticated,
        editorLanguage,

        stdin: controlledStdin,
        initialStdin,
        onChangeStdin,
        showStdinEditor = false,
        webPreviewEntries = [],
        sqlInitialTableSnapshots,
        sqlPaneOptions,
        stdinPlaceholder = "Type stdin here. Each new line becomes one input line.",
        workspaceTerminal,

        testId,
        editorTestId,
        stdinTestId,
        outputTestId,
        mobileEditorTabTestId,
        mobileOutputTabTestId,
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

    const initialLang: WorkspaceLanguage =
        fixedLanguage ??
        (controlled ? (props as any).language : (props as any).initialLanguage) ??
        allowedLangs[0] ??
        "python";

    const [uLang, setULang] = useState<WorkspaceLanguage>(initialLang);

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

    const lang: WorkspaceLanguage = fixedLanguage
        ? fixedLanguage
        : controlled
            ? (props as any).language
            : uLang;

    const isWeb = lang === "web";
    const code: string = controlled ? ((props as any).code ?? "") : uCode;

    const sqlDialect: SqlDialect = fixedSqlDialect
        ? fixedSqlDialect
        : controlled
            ? ((props as any).sqlDialect ?? uSqlDialect)
            : uSqlDialect;

    const stdinControlled = typeof controlledStdin === "string";
    const stdin: string = stdinControlled ? String(controlledStdin ?? "") : uStdin;

    const setLang = (l: WorkspaceLanguage) => {
        if (fixedLanguage) return;
        if (!allowedLangs.includes(l)) return;
        controlled ? (props as any).onChangeLanguage(l) : setULang(l);
    };

    const setCode = (c: string) => {
        if (props.workspace && props.onChangeWorkspace) {
            const entryId = resolveEditableWorkspaceFileId(
                props.workspace,
                props.activeWorkspaceFileId,
            );

            if (entryId) {
                const nextNodes = props.workspace.nodes.map((node) => {
                    if (node.id === entryId && node.kind === "file") {
                        return { ...node, content: c, updatedAt: Date.now() };
                    }
                    return node;
                });
                const nextWorkspace = {
                    ...props.workspace,
                    nodes: nextNodes,
                };
                props.onChangeWorkspace(nextWorkspace);
            }
        }

        if (controlled) {
            (props as any).onChangeCode(c);
        } else {
            setUCode(c);
        }
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

        if (props.workspace && props.onChangeWorkspace) {
            props.onChangeWorkspace({
                ...props.workspace,
                stdin: value,
            });
        }
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
    const terminalAutoOpenRequestedRef = useRef(false);

    const layoutRafRef = useRef<number | null>(null);

    const requestLayout = useCallback(() => {
        if (layoutRafRef.current != null) return;

        layoutRafRef.current = requestAnimationFrame(() => {
            layoutRafRef.current = null;

            const ed = monacoEditorRef.current;
            if (!ed) return;

            try {
                ed.layout?.();
            } catch {}
        });
    }, []);

    useEffect(() => {
        return () => {
            if (layoutRafRef.current != null) {
                cancelAnimationFrame(layoutRafRef.current);
                layoutRafRef.current = null;
            }
        };
    }, []);

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
                    kind: "code",
                    language: args.language,
                    code: args.code,
                    stdin: args.stdin,
                },
                args.signal,
            );
        }

        return runViaApi(
            {
                kind: "code",
                language: args.language,
                code: args.code,
                stdin: args.stdin ?? "",
                captureWorkspace: args.captureWorkspace === true,
                ...(typeof args.entry === "string" && args.files
                    ? {
                        entry: args.entry,
                        files: args.files,
                    }
                    : {}),
            },
            args.signal,
        );
    }, []);

    const runnerLang = (isWeb ? "javascript" : lang) as any;
    const effectiveAllowRun = allowRun && !isWeb;

    const workspaceFileIdForIdentity =
        workspace && typeof workspace === "object"
            ? String(
                (workspace as any).activeFileId ||
                (workspace as any).entryFileId ||
                "",
            )
            : "";

    const stableFallbackIdentity = [
        "code-runner",
        typeof title === "string" && title.trim() ? title.trim() : "untitled",
        String(lang || "python"),
        workspaceFileIdForIdentity || "no-workspace-file",
    ]
        .join(":")
        .replace(/\s+/g, "-");

    /**
     * Never allow EditorPane to use its random internal model key.
     *
     * If exerciseStateKey is missing, fallback to toolScopeKey, then workspace file id,
     * then a deterministic runner identity. This prevents Monaco from creating a fresh
     * random model after sketch/card navigation.
     */
    const validToolScopeKey =
        typeof toolScopeKey === "string" && toolScopeKey.trim()
            ? toolScopeKey
            : undefined;

    const effectiveExerciseStateKey =
        exerciseStateKey ??
        validToolScopeKey ??
        stableFallbackIdentity;

    const effectiveEditorModelKey =
        editorModelKey ??
        `${effectiveExerciseStateKey}:${workspaceFileIdForIdentity || "entry"}`;

    const term = useCodeRunnerController({
        runtime,
        lang: runnerLang,
        code,
        stdin,
        sqlDialect,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlDatasetId,
        sqlResultShape,
        workspace,
        exerciseStateKey: effectiveExerciseStateKey,
        disabled,
        allowRun: effectiveAllowRun,
        resetTerminalOnRun,
        isAuthenticated,
        onRun: onRun ?? defaultOnRun,

        getWorkspaceFiles: workspaceTerminal?.getWorkspaceFiles,
        onTerminalSnapshotFiles: workspaceTerminal?.onTerminalSnapshotFiles,
    } as any);

    const workspaceTerminalEnabled =
        Boolean(workspaceTerminal?.enabled) &&
        isAuthenticated === true &&
        lang !== "sql" &&
        !isWeb;

    const workspaceTerm = useWorkspaceTerminalController({
        enabled: workspaceTerminalEnabled,
        projectId: workspaceTerminal?.projectId,
        cwd: workspaceTerminal?.cwd,
        initialFiles: workspaceTerminal?.initialFiles,
        getWorkspaceFiles: workspaceTerminal?.getWorkspaceFiles,
        onTerminalSnapshotFiles: workspaceTerminal?.onTerminalSnapshotFiles,
        lazy: workspaceTerminal?.lazy ?? true,
        title: workspaceTerminal?.title,
        historyScopeKey: workspaceTerminal?.historyScopeKey,
        exerciseStateKey: effectiveExerciseStateKey,
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
        if (!workspaceTerminalEnabled && outputTab === "terminal") {
            setOutputTab("output");
        }
    }, [workspaceTerminalEnabled, outputTab]);

    useEffect(() => {
        if ((lang === "sql" || isWeb) && outputTab === "terminal") {
            setOutputTab("output");
        }
    }, [lang, isWeb, outputTab]);

    useEffect(() => {
        if (outputTab !== "terminal" || !workspaceTerminalEnabled) {
            terminalAutoOpenRequestedRef.current = false;
            return;
        }

        if (
            workspaceTerm.sessionId ||
            workspaceTerm.started ||
            workspaceTerm.starting
        ) {
            return;
        }

        if (terminalAutoOpenRequestedRef.current) {
            return;
        }

        terminalAutoOpenRequestedRef.current = true;

        void workspaceTerm.open().catch(() => {
            terminalAutoOpenRequestedRef.current = false;
        });
    }, [
        outputTab,
        workspaceTerminalEnabled,
        workspaceTerm.sessionId,
        workspaceTerm.started,
        workspaceTerm.starting,
        workspaceTerm.open,
    ]);

    useEffect(() => {
        if (workspaceTerm.sessionId || workspaceTerm.started || workspaceTerm.starting) {
            terminalAutoOpenRequestedRef.current = false;
        }
    }, [
        workspaceTerm.sessionId,
        workspaceTerm.started,
        workspaceTerm.starting,
    ]);

    useEffect(() => {
        if (!isNarrowScreen) return;
        if (!showEditor || !showTerminal) return;
        if (term.runState !== "idle" && !isWeb) {
            setMobilePane("output");
            setOutputTab("output");
        }
    }, [isNarrowScreen, showEditor, showTerminal, term.runState, isWeb]);

    const onSwitchLang = React.useCallback(
        (next: WorkspaceLanguage) => {
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
            terminalAutoOpenRequestedRef.current = false;
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

    const outputLabel = isWeb ? "Preview" : lang === "sql" ? "Results" : "Output";
    const mobileTabAttention = !isWeb && (term.runState !== "idle" || !!term.lastResult);
    const mobileBodyHeight = Math.max(240, (split.mainH || numericHeight) - 48);

    const showStdinEditorUI = showStdinEditor && showEditor && lang !== "sql" && !isWeb;
    const showWorkspaceTerminalTab = workspaceTerminalEnabled;
    const effectiveEditorLanguage = editorLanguage ?? (isWeb ? "html" : lang);

    const outputModel: OutputSurfaceModel = useMemo(() => {
        if (isWeb) {
            return {
                kind: "web-preview",
                entries: webPreviewEntries,
                title: "Preview",
            };
        }

        if (lang === "sql") {
            return {
                kind: "sql",
                controller: term,
                sqlSchemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                sqlInitialTableSnapshots,
                sqlViewKey: [
                    effectiveEditorModelKey ?? "",
                    sqlDatasetId ?? "",
                    lang,
                    sqlDialect,
                ].join("::"),
                sqlPaneOptions,
            };
        }

        return {
            kind: "runner",
            controller: term,
        };
    }, [
        isWeb,
        webPreviewEntries,
        lang,
        term,
        sqlSchemaSql,
        sqlSetupSql,
        sqlInitialTableSnapshots,
        sqlPaneOptions,
        effectiveEditorModelKey,
        sqlDatasetId,
        sqlDialect,
    ]);

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
                    onBeforeSubmitEnter={workspaceTerm.beforeSubmitEnter}
                    onAfterSubmitEnter={workspaceTerm.afterSubmitEnter}
                />
            );
        }

        return <OutputSurface model={outputModel} disabled={disabled} />;
    };

    const renderOutputPane = (panelHeight?: number, panelWidth?: number) => {
        return (
            <div
                data-testid={outputTestId}
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
                                onClick={() => {
                                    terminalAutoOpenRequestedRef.current = false;
                                    setOutputTab("terminal");
                                }}
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
            data-testid={editorTestId}
            className={PANEL_EDITOR}
            style={{ touchAction: isNarrowScreen ? "pan-y" : "auto", height: "100%" }}
        >
            {process.env.NODE_ENV === "development"
                ? (console.log("[CodeRunner before EditorPane]", {
                    title,
                    toolScopeKey,
                    exerciseStateKey,
                    effectiveExerciseStateKey,
                    editorModelKey,
                    effectiveEditorModelKey,
                    hasWorkspace: !!workspace,
                    workspaceEntryFileId: (workspace as any)?.entryFileId,
                    workspaceActiveFileId: (workspace as any)?.activeFileId,
                    codePreview: String(code ?? "").slice(0, 120),
                }) as any)
                : null}
            {process.env.NODE_ENV !== "production" ? (
                <textarea
                    data-testid="code-editor-e2e-input"
                    aria-label="E2E code editor input"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    style={{
                        position: "absolute",
                        width: 1,
                        height: 1,
                        opacity: 0,
                        pointerEvents: "auto",
                    }}
                />
            ) : null}
            <EditorPane
                frame={frame}
                lang={effectiveEditorLanguage}
                mobileEditMode="auto"
                code={code}
                onChange={setCode}
                theme={editorTheme}
                height={editorHeight}
                disabled={disabled || term.busy}
                modelKey={effectiveEditorModelKey}
                exerciseStateKey={effectiveExerciseStateKey}
                workspace={workspace}
                onMount={(ed) => {
                    monacoEditorRef.current = ed;
                    requestLayout();
                }}
            />
        </div>
    );

    return (
        <div className={outerCls} data-testid={testId}>
            {showHeaderBar ? (
                <div className="relative px-2 z-20 overflow-visible @container">
                    <HeaderBar
                        title={title}
                        disabled={disabled}
                        busy={term.busy && !isWeb}
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
                            terminalAutoOpenRequestedRef.current = false;
                            term.resetTerminal();
                            if (isNarrowScreen && showEditor && showTerminal) {
                                setMobilePane("editor");
                            }
                        }}
                        allowRun={effectiveAllowRun}
                        onRun={async () => {
                            if (isWeb) return;

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
                            data-testid={stdinTestId}
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
                                            data-testid={mobileEditorTabTestId}
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
                                            data-testid={mobileOutputTabTestId}
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
                                    aria-disabled={term.runState !== "idle" && !isWeb}
                                    onPointerDown={
                                        term.runState !== "idle" && !isWeb ? undefined : split.onPointerDownSplit
                                    }
                                    onKeyDown={
                                        term.runState !== "idle" && !isWeb ? undefined : split.separatorProps.onKeyDown
                                    }
                                    className={[
                                        "h-[6px]",
                                        SPLIT_BAR_IDLE,
                                        term.runState !== "idle" && !isWeb
                                            ? "cursor-not-allowed opacity-60"
                                            : `cursor-row-resize ${SPLIT_BAR_ACTIVE}`,
                                    ].join(" ")}
                                    title={
                                        term.runState !== "idle" && !isWeb
                                            ? "Cannot resize while a run session is active"
                                            : "Drag or use arrow keys to resize preview"
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
                                    aria-disabled={term.runState !== "idle" && !isWeb}
                                    onPointerDown={
                                        term.runState !== "idle" && !isWeb ? undefined : split.onPointerDownSplit
                                    }
                                    onKeyDown={
                                        term.runState !== "idle" && !isWeb ? undefined : split.separatorProps.onKeyDown
                                    }
                                    className={[
                                        "w-[6px]",
                                        SPLIT_BAR_IDLE,
                                        term.runState !== "idle" && !isWeb
                                            ? "cursor-not-allowed opacity-60"
                                            : `cursor-col-resize ${SPLIT_BAR_ACTIVE}`,
                                    ].join(" ")}
                                    title={
                                        term.runState !== "idle" && !isWeb
                                            ? "Cannot resize while a run session is active"
                                            : "Drag or use arrow keys to resize preview"
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
