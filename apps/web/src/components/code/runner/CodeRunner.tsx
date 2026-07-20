"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
import BinaryFileViewer from "@/components/ide/fullide/panes/BinaryFileViewer";
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
import {
    buildTerminalAutoOpenKey,
    type WorkspaceSyncEntry,
    type WorkspaceTerminalConfig,
} from "@/components/code/runner/runtime";
import { WorkspaceStateV2 } from "@/components/ide/types";
import { cx } from "@/components/tools/utils/cx";
import HeaderBar from "@/components/code/runner/components/HeaderBar";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import type {
    RunnerPaneTab,
    ToolRunnerPanePolicy,
    ToolSurface,
} from "@zoeskoul/curriculum-contracts";
import { resolveEditableWorkspaceFileId } from "@/components/code/runner/workspaceEditing";
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";
import {
    buildWorkspaceTerminalHostKey,
    buildWorkspaceTerminalOwnerKey,
    canCreateWorkspaceTerminalTab,
    cancelTerminalHostNow,
    cancelWorkspaceTerminalHost,
    cancelWorkspaceTerminalOwner,
    clearScheduledTerminalHostCleanup,
    createWorkspaceTerminalTab,
    getOrCreateTerminalWindowId,
    heartbeatTerminalHost,
    loadWorkspaceTerminalTabs,
    readTerminalCapacity,
    reconcileWorkspaceTerminalTabs,
    saveWorkspaceTerminalTabs,
    scheduleTerminalHostCleanup,
    type TerminalCapacity,
    type WorkspaceTerminalTab,
} from "@/components/code/runner/workspaceTerminalHosts";
import type {
    CodeRunnerController,
    WorkspaceTerminalController,
} from "@/components/code/runner/runtime";

type MobilePane = "editor" | "output";
type OutputTab = RunnerPaneTab;

export function resolveSqlMobilePaneDefault(args: {
    language: WorkspaceLanguage;
    defaultSurface?: ToolSurface | null;
    sqlPaneOptions?: SqlPaneOptions | null;
    runnerPaneOptions?: ToolRunnerPanePolicy | null;
}): MobilePane {
    if (args.defaultSurface === "results") return "output";
    if (args.defaultSurface === "editor") return "editor";

    // Backward compatibility for older bundles that authored only an inner
    // tab. New compiler output should emit defaultSurface explicitly.
    const hasAuthoredRunnerTab = Boolean(
        args.runnerPaneOptions?.defaultTab ??
        args.runnerPaneOptions?.compactDefaultTab,
    );
    const hasLegacyAuthoredSqlTab = Boolean(
        args.sqlPaneOptions?.defaultTab ??
        args.sqlPaneOptions?.compactDefaultTab,
    );

    return hasAuthoredRunnerTab ||
        (args.language === "sql" && hasLegacyAuthoredSqlTab)
        ? "output"
        : "editor";
}

export function resolveRunnerPaneDefaultTab(args: {
    policy?: ToolRunnerPanePolicy | null;
    compact: boolean;
    terminalAvailable: boolean;
    terminalOnlyMode: boolean;
}): OutputTab {
    if (args.terminalOnlyMode) return "terminal";

    const authored = args.compact
        ? args.policy?.compactDefaultTab ?? args.policy?.defaultTab
        : args.policy?.defaultTab;

    return authored === "terminal" && args.terminalAvailable
        ? "terminal"
        : "output";
}

type IdleOutputCollapseArgs = {
    compactLearnerUi: boolean;
    showEditor: boolean;
    showTerminal: boolean;
    terminalOnlyMode: boolean;
    isWeb: boolean;
    language: WorkspaceLanguage;
    outputTab: OutputTab;
    runner: Pick<
        CodeRunnerController,
        "busy" | "runState" | "lastResult" | "transcript" | "stream"
    >;
    workspaceTerminalEnabled: boolean;
    workspaceTerminal: Pick<
        WorkspaceTerminalController,
        "busy" | "starting" | "started" | "sessionId" | "inputEnabled" | "terminalFeed"
    >;
};

type WorkspaceTerminalAutoOpenArgs = {
    outputTab: OutputTab;
    workspaceTerminalEnabled: boolean;
    recoverState: string;
    state: string;
    restarting: boolean;
    stopping: boolean;
    sessionId: string | null;
    started: boolean;
    starting: boolean;
    autoOpenAlreadyRequested: boolean;
};

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
    runnerPaneOptions?: ToolRunnerPanePolicy;
    defaultSurface?: ToolSurface;
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

// Short guard only. A 60s module-level claim makes exercise navigation show
// a blank "Idle" terminal until the learner clicks/presses something.
const TERMINAL_AUTO_OPEN_COOLDOWN_MS = 2_500;
const TERMINAL_AUTO_OPEN_DELAY_MS = 180;
const TERMINAL_AUTO_OPEN_VERIFY_DELAY_MS = 700;
const TERMINAL_AUTO_OPEN_MAX_RECOVERY_ATTEMPTS = 2;
const terminalAutoOpenClaims = new Map<string, number>();

function pruneTerminalAutoOpenClaims(now: number) {
    for (const [key, at] of terminalAutoOpenClaims) {
        if (now - at > TERMINAL_AUTO_OPEN_COOLDOWN_MS * 2) {
            terminalAutoOpenClaims.delete(key);
        }
    }
}

function shouldClaimTerminalAutoOpen(key: string) {
    const now = Date.now();
    pruneTerminalAutoOpenClaims(now);

    const previous = terminalAutoOpenClaims.get(key) ?? 0;
    if (now - previous < TERMINAL_AUTO_OPEN_COOLDOWN_MS) {
        return false;
    }

    terminalAutoOpenClaims.set(key, now);
    return true;
}

function releaseTerminalAutoOpenClaim(key: string) {
    terminalAutoOpenClaims.delete(key);
}

function hasMeaningfulRunnerOutput(
    controller: Pick<
        CodeRunnerController,
        "busy" | "runState" | "lastResult" | "transcript" | "stream"
    >,
) {
    if (controller.busy || controller.runState !== "idle" || controller.lastResult) {
        return true;
    }

    if (controller.transcript) {
        if (controller.transcript.awaitingInput || controller.transcript.terminal.length > 0) {
            return true;
        }
    }

    if (controller.stream) {
        if (controller.stream.inputEnabled || controller.stream.terminalFeed.length > 0) {
            return true;
        }
    }

    return false;
}

function hasMeaningfulWorkspaceTerminalOutput(
    controller: Pick<
        WorkspaceTerminalController,
        "busy" | "starting" | "started" | "sessionId" | "inputEnabled" | "terminalFeed"
    >,
) {
    return (
        controller.busy ||
        controller.starting ||
        controller.started ||
        Boolean(controller.sessionId) ||
        controller.inputEnabled ||
        controller.terminalFeed.length > 0
    );
}

export function shouldCollapseIdleOutputPanel(args: IdleOutputCollapseArgs) {
    if (!args.compactLearnerUi) return false;
    if (!args.showEditor || !args.showTerminal || args.terminalOnlyMode) return false;
    if (args.isWeb || args.language === "sql") return false;
    if (args.outputTab !== "output") return false;
    if (hasMeaningfulRunnerOutput(args.runner)) return false;

    if (
        args.workspaceTerminalEnabled &&
        hasMeaningfulWorkspaceTerminalOutput(args.workspaceTerminal)
    ) {
        return false;
    }

    return true;
}

export function shouldOpenEditorForWorkspaceFileSelection(args: {
    previousFileId: string | null;
    nextFileId: string | null;
    previousSelectionVersion?: number | null;
    nextSelectionVersion?: number | null;
    isNarrowScreen: boolean;
    showEditor: boolean;
    showTerminal: boolean;
}) {
    const fileChanged = Boolean(
        args.previousFileId &&
        args.nextFileId &&
        args.previousFileId !== args.nextFileId,
    );
    const explicitSelectionChanged = Boolean(
        args.nextFileId &&
        args.previousSelectionVersion != null &&
        args.nextSelectionVersion != null &&
        args.previousSelectionVersion !== args.nextSelectionVersion,
    );

    return Boolean(
        (fileChanged || explicitSelectionChanged) &&
        args.isNarrowScreen &&
        args.showEditor &&
        args.showTerminal,
    );
}

export function resolveMobileKeyboardViewport(args: {
    visualViewportHeight: number;
    visualViewportOffsetTop: number;
    layoutViewportHeight: number;
    baselineViewportHeight: number;
    rootTop: number;
    editorHasTextFocus: boolean;
    keyboardThreshold?: number;
    bottomPadding?: number;
}) {
    const keyboardThreshold = Math.max(48, args.keyboardThreshold ?? 96);
    const bottomPadding = Math.max(0, args.bottomPadding ?? 8);
    const baselineHeight = Math.max(
        args.visualViewportHeight,
        args.baselineViewportHeight,
    );
    const visualShrink = Math.max(0, baselineHeight - args.visualViewportHeight);
    const layoutShrink = Math.max(
        0,
        args.layoutViewportHeight -
            args.visualViewportHeight -
            args.visualViewportOffsetTop,
    );
    const keyboardOpen = Boolean(
        args.editorHasTextFocus &&
            Math.max(visualShrink, layoutShrink) >= keyboardThreshold,
    );
    const viewportTop = Math.max(0, args.visualViewportOffsetTop);
    const viewportBottom = viewportTop + Math.max(0, args.visualViewportHeight);
    const availableHeight = Math.max(
        0,
        Math.floor(viewportBottom - Math.max(args.rootTop, viewportTop) - bottomPadding),
    );

    return {
        keyboardOpen,
        availableHeight,
        visualShrink,
        layoutShrink,
    };
}

export function shouldAutoOpenWorkspaceTerminal(args: WorkspaceTerminalAutoOpenArgs) {
    if (args.outputTab !== "terminal" || !args.workspaceTerminalEnabled) {
        return false;
    }

    /**
     * One automatic attempt per terminal scope.
     *
     * If that attempt fails, stop and wait for an explicit learner restart.
     * This prevents a single visible terminal from repeatedly hammering the
     * session-start endpoint and tripping the runner rate limits.
     */
    if (args.autoOpenAlreadyRequested) {
        return false;
    }

    if (args.recoverState === "blocked_too_many_sessions") {
        return false;
    }

    if (args.state === "failed") {
        return false;
    }

    if (args.restarting || args.stopping) {
        return false;
    }

    if (args.sessionId || args.started || args.starting) {
        return false;
    }

    return true;
}

export async function restartWorkspaceTerminalSession(args: {
    resetAutoOpen: () => void;
    workspaceTerm: {
        stop: () => Promise<void>;
        open: (options?: { userInitiated?: boolean }) => Promise<void>;
        restart?: () => Promise<void>;
    };
}) {
    args.resetAutoOpen();

    if (typeof args.workspaceTerm.restart === "function") {
        await args.workspaceTerm.restart();
        return;
    }

    await args.workspaceTerm.stop();
    await args.workspaceTerm.open({ userInitiated: true });
}

function CodeRunnerContent(props: CodeRunnerWithStdinProps) {
    const t = useTranslations("ide.codeRunner");
    const {
        frame = "card" as CodeRunnerFrame,
        className,
        title = t("defaultTitle"),
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
        showOpenTerminalButton = true,
        showRestartTerminalButton = true,
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
        activeBinaryFile,
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
        runnerPaneOptions,
        defaultSurface,
        stdinPlaceholder = t("stdinPlaceholder"),
        workspaceTerminal,
        onTerminalEvidenceChange,
        onTerminalSyncReady,

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
    const runnerRootRef = useRef<HTMLDivElement | null>(null);
    const [isNarrowScreen, setIsNarrowScreen] = useState(false);
    const initialMobilePaneLanguage: WorkspaceLanguage =
        fixedLanguage ??
        (controlled ? (props as any).language : (props as any).initialLanguage) ??
        allowedLanguages?.[0] ??
        "python";
    const [mobilePane, setMobilePane] = useState<MobilePane>(() =>
        resolveSqlMobilePaneDefault({
            language: initialMobilePaneLanguage,
            defaultSurface,
            sqlPaneOptions,
            runnerPaneOptions,
        }),
    );
    const appliedSqlMobilePaneDefaultKeyRef = useRef<string | null>(null);
    const appliedRunnerPaneDefaultKeyRef = useRef<string | null>(null);
    const previousWorkspaceFileIdRef = useRef<string | null>(
        typeof props.activeWorkspaceFileId === "string"
            ? props.activeWorkspaceFileId
            : null,
    );
    const previousWorkspaceFileSelectionVersionRef = useRef<number | null>(
        typeof props.workspaceFileSelectionVersion === "number"
            ? props.workspaceFileSelectionVersion
            : null,
    );

    useEffect(() => {
        if (!showEditorThemeToggle) {
            setEditorTheme(resolvedTheme === "dark" ? "vs-dark" : "vs");
        }
    }, [resolvedTheme, showEditorThemeToggle]);

    useEffect(() => {
        const node = runnerRootRef.current;
        if (!node || typeof window === "undefined") return;

        const updateFromWidth = (width: number) => {
            setIsNarrowScreen(width <= 767);
        };

        updateFromWidth(node.getBoundingClientRect().width);

        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver((entries) => {
                const width = entries[0]?.contentRect.width;
                if (typeof width === "number") updateFromWidth(width);
            });

            observer.observe(node);
            return () => observer.disconnect();
        }

        const update = () => updateFromWidth(node.getBoundingClientRect().width);
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
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
    const workspaceTerminalEnabled =
        Boolean(workspaceTerminal?.enabled) &&
        isAuthenticated === true &&
        lang !== "sql" &&
        !isWeb;
    const [terminalWindowId, setTerminalWindowId] = useState<string | null>(null);
    const [terminalTabs, setTerminalTabs] = useState<WorkspaceTerminalTab[]>([
        { id: "primary", label: "Terminal 1" },
    ]);
    const [activeTerminalId, setActiveTerminalId] = useState("primary");
    const [terminalCapacity, setTerminalCapacity] = useState<TerminalCapacity>({
        activeCount: 0,
        maxActiveSessions: 4,
        hostActiveOwnerKeys: [],
    });
    const [pendingTerminalStartId, setPendingTerminalStartId] = useState<string | null>(
        null,
    );
    const [terminalTabMessage, setTerminalTabMessage] = useState<string | null>(null);
    const [hydratedTerminalHostKey, setHydratedTerminalHostKey] = useState<string | null>(null);
    const previousTerminalWorkspaceIdentityRef = useRef<{
        hostKey: string;
        workspaceKey: string;
    } | null>(null);

    useEffect(() => {
        setTerminalWindowId(getOrCreateTerminalWindowId());
    }, []);

    const terminalExperienceKey = useMemo(
        () =>
            String(
                workspaceTerminal?.terminalHostKey ??
                    workspaceTerminal?.historyScopeKey ??
                    workspaceTerminal?.projectId ??
                    `standalone:${lang}:${workspaceTerminal?.cwd ?? "/workspace"}`,
            ),
        [
            lang,
            workspaceTerminal?.cwd,
            workspaceTerminal?.historyScopeKey,
            workspaceTerminal?.projectId,
            workspaceTerminal?.terminalHostKey,
        ],
    );
    const terminalWorkspaceIdentityKey = String(
        workspaceTerminal?.workspaceKey ??
            exerciseStateKey ??
            workspaceTerminal?.projectId ??
            `${lang}:${workspaceTerminal?.cwd ?? "/workspace"}`,
    );

    const resolvedTerminalHostKey = useMemo(() => {
        if (!terminalWindowId || !workspaceTerminalEnabled) return null;

        return buildWorkspaceTerminalHostKey({
            windowId: terminalWindowId,
            experienceKey: terminalExperienceKey,
        });
    }, [terminalExperienceKey, terminalWindowId, workspaceTerminalEnabled]);
    const activeTerminalOwnerKey = useMemo(
        () =>
            resolvedTerminalHostKey
                ? buildWorkspaceTerminalOwnerKey({
                      hostKey: resolvedTerminalHostKey,
                      terminalId: activeTerminalId,
                  })
                : null,
        [activeTerminalId, resolvedTerminalHostKey],
    );

    useEffect(() => {
        if (!resolvedTerminalHostKey) return;

        clearScheduledTerminalHostCleanup(resolvedTerminalHostKey);
        const restored = loadWorkspaceTerminalTabs(resolvedTerminalHostKey);
        let disposed = false;

        const hydrate = async () => {
            await heartbeatTerminalHost(resolvedTerminalHostKey);
            const capacity = await readTerminalCapacity(resolvedTerminalHostKey);
            if (disposed) return;

            setTerminalCapacity(capacity);
            const reconciled = reconcileWorkspaceTerminalTabs({
                hostKey: resolvedTerminalHostKey,
                tabs: restored.tabs,
                activeId: restored.activeId,
                liveOwnerKeys: capacity.hostActiveOwnerKeys,
            });
            setTerminalTabs(reconciled.tabs);
            setActiveTerminalId(reconciled.activeId);
            setHydratedTerminalHostKey(resolvedTerminalHostKey);
        };

        void hydrate().catch(() => {
            if (disposed) return;
            setTerminalTabs([{ id: "primary", label: "Terminal 1" }]);
            setActiveTerminalId("primary");
            setHydratedTerminalHostKey(resolvedTerminalHostKey);
        });

        const handlePageHide = () => {
            cancelTerminalHostNow(resolvedTerminalHostKey);
        };
        const heartbeat = () => {
            void heartbeatTerminalHost(resolvedTerminalHostKey);
        };
        const heartbeatTimer = window.setInterval(heartbeat, 25_000);
        window.addEventListener("pagehide", handlePageHide);

        return () => {
            disposed = true;
            window.clearInterval(heartbeatTimer);
            window.removeEventListener("pagehide", handlePageHide);
            scheduleTerminalHostCleanup(resolvedTerminalHostKey);
        };
    }, [resolvedTerminalHostKey]);

    useEffect(() => {
        if (!resolvedTerminalHostKey) return;

        const current = {
            hostKey: resolvedTerminalHostKey,
            workspaceKey: terminalWorkspaceIdentityKey,
        };
        const previous = previousTerminalWorkspaceIdentityRef.current;
        previousTerminalWorkspaceIdentityRef.current = current;

        if (!previous) return;
        if (previous.hostKey !== current.hostKey) return;
        if (previous.workspaceKey === current.workspaceKey) return;

        let disposed = false;
        setHydratedTerminalHostKey(null);
        setPendingTerminalStartId(null);
        setTerminalTabMessage(null);

        void cancelWorkspaceTerminalHost(resolvedTerminalHostKey)
            .catch(() => null)
            .then(() => {
                if (disposed) return;

                setTerminalTabs([{ id: "primary", label: "Terminal 1" }]);
                setActiveTerminalId("primary");
                setTerminalCapacity((current) => ({
                    ...current,
                    hostActiveOwnerKeys: [],
                }));
                setHydratedTerminalHostKey(resolvedTerminalHostKey);
                setPendingTerminalStartId("primary");
            });

        return () => {
            disposed = true;
        };
    }, [resolvedTerminalHostKey, terminalWorkspaceIdentityKey]);

    useEffect(() => {
        if (
            !resolvedTerminalHostKey ||
            hydratedTerminalHostKey !== resolvedTerminalHostKey
        ) {
            return;
        }
        saveWorkspaceTerminalTabs(
            resolvedTerminalHostKey,
            terminalTabs,
            activeTerminalId,
        );
    }, [
        activeTerminalId,
        hydratedTerminalHostKey,
        resolvedTerminalHostKey,
        terminalTabs,
    ]);

    const refreshTerminalCapacity = useCallback(async () => {
        if (!workspaceTerminalEnabled) return null;

        try {
            const next = await readTerminalCapacity(resolvedTerminalHostKey);
            setTerminalCapacity(next);
            return next;
        } catch {
            return null;
        }
    }, [resolvedTerminalHostKey, workspaceTerminalEnabled]);

    useEffect(() => {
        if (!workspaceTerminalEnabled) return;
        void refreshTerminalCapacity();
    }, [refreshTerminalCapacity, workspaceTerminalEnabled]);

    const terminalOnlyMode = !showEditor && showTerminal && workspaceTerminalEnabled;
    const [outputTab, setOutputTab] = useState<OutputTab>(() =>
        resolveRunnerPaneDefaultTab({
            policy: runnerPaneOptions,
            compact: false,
            terminalAvailable: workspaceTerminalEnabled,
            terminalOnlyMode,
        }),
    );

    const sqlMobilePaneDefault = resolveSqlMobilePaneDefault({
        language: lang,
        defaultSurface,
        sqlPaneOptions,
        runnerPaneOptions,
    });
    const sqlMobilePaneDefaultKey = [
        toolScopeKey ?? "",
        exerciseStateKey ?? "",
        editorModelKey ?? "",
        sqlDatasetId ?? "",
        defaultSurface ?? "",
        sqlPaneOptions?.defaultTab ?? "",
        sqlPaneOptions?.compactDefaultTab ?? "",
        runnerPaneOptions?.defaultTab ?? "",
        runnerPaneOptions?.compactDefaultTab ?? "",
    ].join("::");

    useEffect(() => {
        if (
            appliedSqlMobilePaneDefaultKeyRef.current ===
            sqlMobilePaneDefaultKey
        ) {
            return;
        }

        appliedSqlMobilePaneDefaultKeyRef.current = sqlMobilePaneDefaultKey;
        setMobilePane(sqlMobilePaneDefault);
    }, [sqlMobilePaneDefault, sqlMobilePaneDefaultKey]);

    const runnerPaneDefaultTab = resolveRunnerPaneDefaultTab({
        policy: runnerPaneOptions,
        compact: isNarrowScreen,
        terminalAvailable: workspaceTerminalEnabled,
        terminalOnlyMode,
    });
    // Apply the authored inner-tab default once per lesson/exercise identity.
    // Active-file changes are not a new curriculum scope and must not reset a
    // learner's manual Output/Terminal choice.
    const runnerPaneDefaultKey = [
        toolScopeKey ?? "",
        exerciseStateKey ?? "",
        lang,
        isNarrowScreen ? "compact" : "desktop",
        runnerPaneOptions?.defaultTab ?? "",
        runnerPaneOptions?.compactDefaultTab ?? "",
        workspaceTerminalEnabled ? "terminal-enabled" : "terminal-disabled",
        terminalOnlyMode ? "terminal-only" : "editor-terminal",
    ].join("::");

    useEffect(() => {
        if (appliedRunnerPaneDefaultKeyRef.current === runnerPaneDefaultKey) {
            return;
        }

        appliedRunnerPaneDefaultKeyRef.current = runnerPaneDefaultKey;
        setOutputTab(runnerPaneDefaultTab);
        if (isNarrowScreen && runnerPaneDefaultTab === "terminal") {
            setMobilePane("output");
        }
    }, [
        isNarrowScreen,
        runnerPaneDefaultKey,
        runnerPaneDefaultTab,
    ]);

    const setLang = (l: WorkspaceLanguage) => {
        if (fixedLanguage) return;
        if (!allowedLangs.includes(l)) return;
        controlled ? (props as any).onChangeLanguage(l) : setULang(l);
    };

    const setCode = (c: string) => {
        if (activeBinaryFile) return;

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
    const terminalAutoOpenRequestedKeyRef = useRef<string | null>(null);
    const mobileKeyboardBaselineRef = useRef(0);
    const mobileKeyboardMeasureRafRef = useRef<number | null>(null);
    const mobileKeyboardOwnerId = useId();
    const mobileKeyboardOwnerRef = useRef(
        `code-runner-${mobileKeyboardOwnerId.replace(/:/g, "")}`,
    );
    const [mobileKeyboardOpen, setMobileKeyboardOpen] = useState(false);
    const [mobileKeyboardAvailableHeight, setMobileKeyboardAvailableHeight] =
        useState<number | null>(null);

    const readLiveEditorCode = useCallback(() => {
        if (activeBinaryFile) return code;

        const editor = monacoEditorRef.current;

        try {
            const model = editor?.getModel?.();
            const live = model?.getValue?.();

            if (typeof live === "string") {
                return live;
            }
        } catch {}

        return code;
    }, [activeBinaryFile, code]);

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

    const keepMobileCursorVisible = useCallback(() => {
        requestLayout();

        requestAnimationFrame(() => {
            const ed = monacoEditorRef.current;
            if (!ed || ed.isDisposed?.() === true) return;

            try {
                ed.layout?.();
                const position = ed.getPosition?.();
                if (position) {
                    ed.revealPositionInCenterIfOutsideViewport?.(position);
                }
            } catch {}
        });
    }, [requestLayout]);

    useEffect(() => {
        if (!isNarrowScreen || !showEditor || typeof window === "undefined") {
            setMobileKeyboardOpen(false);
            setMobileKeyboardAvailableHeight(null);
            mobileKeyboardBaselineRef.current = 0;
            return;
        }

        const visualViewport = window.visualViewport;
        if (!visualViewport) return;

        const measure = () => {
            mobileKeyboardMeasureRafRef.current = null;

            const root = runnerRootRef.current;
            if (!root) return;

            const editor = monacoEditorRef.current;
            let editorHasTextFocus = false;

            try {
                editorHasTextFocus = editor?.hasTextFocus?.() === true;
            } catch {}

            const viewportHeight = Math.max(0, visualViewport.height);
            mobileKeyboardBaselineRef.current = Math.max(
                mobileKeyboardBaselineRef.current,
                viewportHeight,
            );

            const next = resolveMobileKeyboardViewport({
                visualViewportHeight: viewportHeight,
                visualViewportOffsetTop: visualViewport.offsetTop,
                layoutViewportHeight: Math.max(
                    window.innerHeight || 0,
                    document.documentElement.clientHeight || 0,
                ),
                baselineViewportHeight: mobileKeyboardBaselineRef.current,
                rootTop: root.getBoundingClientRect().top,
                editorHasTextFocus,
            });

            setMobileKeyboardOpen((previous) =>
                previous === next.keyboardOpen ? previous : next.keyboardOpen,
            );
            setMobileKeyboardAvailableHeight((previous) => {
                const value = next.keyboardOpen ? next.availableHeight : null;
                return previous === value ? previous : value;
            });

            if (next.keyboardOpen) {
                keepMobileCursorVisible();
            }
        };

        const scheduleMeasure = () => {
            if (mobileKeyboardMeasureRafRef.current != null) return;
            mobileKeyboardMeasureRafRef.current = requestAnimationFrame(measure);
        };

        const handleOrientationChange = () => {
            mobileKeyboardBaselineRef.current = Math.max(0, visualViewport.height);
            scheduleMeasure();
        };

        measure();
        visualViewport.addEventListener("resize", scheduleMeasure);
        visualViewport.addEventListener("scroll", scheduleMeasure);
        window.addEventListener("resize", scheduleMeasure);
        window.addEventListener("orientationchange", handleOrientationChange);
        document.addEventListener("focusin", scheduleMeasure);
        document.addEventListener("focusout", scheduleMeasure);

        return () => {
            visualViewport.removeEventListener("resize", scheduleMeasure);
            visualViewport.removeEventListener("scroll", scheduleMeasure);
            window.removeEventListener("resize", scheduleMeasure);
            window.removeEventListener("orientationchange", handleOrientationChange);
            document.removeEventListener("focusin", scheduleMeasure);
            document.removeEventListener("focusout", scheduleMeasure);

            if (mobileKeyboardMeasureRafRef.current != null) {
                cancelAnimationFrame(mobileKeyboardMeasureRafRef.current);
                mobileKeyboardMeasureRafRef.current = null;
            }
        };
    }, [isNarrowScreen, keepMobileCursorVisible, showEditor]);

    useEffect(() => {
        if (!mobileKeyboardOpen || typeof document === "undefined") return;

        const root = document.documentElement;
        const owner = mobileKeyboardOwnerRef.current;
        root.dataset.zoeMobileKeyboard = "open";
        root.dataset.zoeMobileKeyboardOwner = owner;

        return () => {
            if (root.dataset.zoeMobileKeyboardOwner !== owner) return;
            delete root.dataset.zoeMobileKeyboard;
            delete root.dataset.zoeMobileKeyboardOwner;
        };
    }, [mobileKeyboardOpen]);

    useEffect(() => {
        if (
            !mobileKeyboardOpen ||
            !isNarrowScreen ||
            typeof window === "undefined"
        ) {
            return;
        }

        const visualViewport = window.visualViewport;
        if (!visualViewport) return;

        let firstRaf = 0;
        let secondRaf = 0;

        /**
         * The mobile Exercise/Code chrome is hidden once the keyboard state is
         * committed. Measure again after that layout change so the editor gets
         * every newly available pixel instead of keeping the pre-hide height.
         */
        firstRaf = requestAnimationFrame(() => {
            secondRaf = requestAnimationFrame(() => {
                const root = runnerRootRef.current;
                if (!root) return;

                const next = resolveMobileKeyboardViewport({
                    visualViewportHeight: Math.max(0, visualViewport.height),
                    visualViewportOffsetTop: visualViewport.offsetTop,
                    layoutViewportHeight: Math.max(
                        window.innerHeight || 0,
                        document.documentElement.clientHeight || 0,
                    ),
                    baselineViewportHeight: mobileKeyboardBaselineRef.current,
                    rootTop: root.getBoundingClientRect().top,
                    editorHasTextFocus: true,
                });

                setMobileKeyboardAvailableHeight((previous) =>
                    previous === next.availableHeight
                        ? previous
                        : next.availableHeight,
                );
                keepMobileCursorVisible();
            });
        });

        return () => {
            cancelAnimationFrame(firstRaf);
            cancelAnimationFrame(secondRaf);
        };
    }, [isNarrowScreen, keepMobileCursorVisible, mobileKeyboardOpen]);

    useEffect(() => {
        return () => {
            if (layoutRafRef.current != null) {
                cancelAnimationFrame(layoutRafRef.current);
                layoutRafRef.current = null;
            }

            if (mobileKeyboardMeasureRafRef.current != null) {
                cancelAnimationFrame(mobileKeyboardMeasureRafRef.current);
                mobileKeyboardMeasureRafRef.current = null;
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
    const effectiveAllowRun = allowRun && !isWeb && !activeBinaryFile;

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
        getLatestCode: readLiveEditorCode,
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

    const workspaceTerm = useWorkspaceTerminalController({
        enabled:
            workspaceTerminalEnabled &&
            Boolean(resolvedTerminalHostKey) &&
            hydratedTerminalHostKey === resolvedTerminalHostKey &&
            Boolean(activeTerminalOwnerKey),
        projectId: workspaceTerminal?.projectId,
        cwd: workspaceTerminal?.cwd,
        bootstrap: workspaceTerminal?.bootstrap,
        workspaceKey: workspaceTerminal?.workspaceKey ?? effectiveExerciseStateKey,
        terminalHostKey: resolvedTerminalHostKey ?? undefined,
        terminalOwnerKey: activeTerminalOwnerKey ?? undefined,
        preserveSessionOnUnmount: true,
        initialFiles: workspaceTerminal?.initialFiles,
        getWorkspaceFiles: workspaceTerminal?.getWorkspaceFiles,
        onTerminalSnapshotFiles: workspaceTerminal?.onTerminalSnapshotFiles,
        lazy: workspaceTerminal?.lazy ?? true,
        title: workspaceTerminal?.title,
        historyScopeKey: workspaceTerminal?.historyScopeKey,
        exerciseStateKey: effectiveExerciseStateKey,
    });

    useEffect(() => {
        onTerminalEvidenceChange?.(workspaceTerm.terminalEvidence);
    }, [onTerminalEvidenceChange, workspaceTerm.terminalEvidence]);

    useEffect(() => {
        if (!workspaceTerm.sessionId) return;

        const timer = window.setTimeout(() => {
            void refreshTerminalCapacity();
        }, 250);

        return () => window.clearTimeout(timer);
    }, [refreshTerminalCapacity, workspaceTerm.sessionId]);

    const activeTerminalLeaseLive = Boolean(
        activeTerminalOwnerKey &&
            terminalCapacity.hostActiveOwnerKeys.includes(activeTerminalOwnerKey),
    );
    const activeWorkspaceTerminalReady = Boolean(
        activeTerminalLeaseLive &&
            workspaceTerm.sessionId &&
            workspaceTerm.interactiveReady &&
            !workspaceTerm.starting &&
            !workspaceTerm.stopping &&
            !workspaceTerm.restarting,
    );

    useEffect(() => {
        if (pendingTerminalStartId !== activeTerminalId) return;
        if (!workspaceTerminalEnabled || disabled) return;

        let disposed = false;
        const timer = window.setTimeout(() => {
            void workspaceTerm
                .open({ userInitiated: true })
                .catch((error) => {
                    if (disposed) return;
                    setPendingTerminalStartId(null);
                    setTerminalTabMessage(
                        error instanceof Error
                            ? error.message
                            : "Could not start the terminal.",
                    );
                });
        }, 0);

        return () => {
            disposed = true;
            window.clearTimeout(timer);
        };
    }, [
        activeTerminalId,
        disabled,
        pendingTerminalStartId,
        workspaceTerm.open,
        workspaceTerminalEnabled,
    ]);

    useEffect(() => {
        if (pendingTerminalStartId !== activeTerminalId) return;
        if (!activeWorkspaceTerminalReady) return;

        setPendingTerminalStartId(null);
        setTerminalTabMessage(null);
        void refreshTerminalCapacity();
    }, [
        activeTerminalId,
        activeWorkspaceTerminalReady,
        pendingTerminalStartId,
        refreshTerminalCapacity,
    ]);

    const syncWorkspaceAndTerminalEvidenceNow = useCallback(async () => {
        const ok = await workspaceTerm.syncWorkspaceNow();

        /**
         * The workspace snapshot and the terminal transcript have different
         * clocks. Force the latest synchronous terminal evidence through the
         * Tools -> quiz bridge during submit flush so validation never sees an
         * older command list while the visible terminal is already correct.
         */
        onTerminalEvidenceChange?.(workspaceTerm.getTerminalEvidenceNow());

        return ok;
    }, [
        onTerminalEvidenceChange,
        workspaceTerm,
    ]);

    useEffect(() => {
        if (!onTerminalSyncReady) return;

        if (!workspaceTerminalEnabled) {
            onTerminalSyncReady(null);
            return;
        }

        onTerminalSyncReady(syncWorkspaceAndTerminalEvidenceNow);

        return () => {
            onTerminalSyncReady(null);
        };
    }, [
        onTerminalSyncReady,
        workspaceTerminalEnabled,
        syncWorkspaceAndTerminalEvidenceNow,
    ]);

    useEffect(() => {
        const w = window as typeof window & {
            __pwEnableFullIdeTerminalInputHook?: boolean;
            __pwForceTerminalWorkspaceSync?: (() => Promise<boolean>) | undefined;
        };

        if (process.env.NODE_ENV === "production" || !workspaceTerminalEnabled) {
            if (w.__pwForceTerminalWorkspaceSync) {
                delete w.__pwForceTerminalWorkspaceSync;
            }
            return;
        }

        w.__pwEnableFullIdeTerminalInputHook = true;
        w.__pwForceTerminalWorkspaceSync = workspaceTerm.syncWorkspaceNow;

        return () => {
            if (w.__pwForceTerminalWorkspaceSync === workspaceTerm.syncWorkspaceNow) {
                delete w.__pwForceTerminalWorkspaceSync;
            }
        };
    }, [workspaceTerminalEnabled, workspaceTerm.syncWorkspaceNow]);


    const terminalAutoOpenKey = buildTerminalAutoOpenKey({
        workspaceKey: [
            workspaceTerminal?.workspaceKey ?? effectiveExerciseStateKey,
            activeTerminalOwnerKey ?? "pending-owner",
        ].join("::"),
        exerciseStateKey: effectiveExerciseStateKey,
        projectId: workspaceTerminal?.projectId,
        cwd: workspaceTerminal?.cwd,
    });

    const [terminalAutoOpenRetryTick, setTerminalAutoOpenRetryTick] = useState(0);
    const terminalAutoOpenRetryCountsRef = useRef<Map<string, number>>(new Map());
    const latestWorkspaceTerminalAutoOpenStateRef = useRef<
        (WorkspaceTerminalAutoOpenArgs & { terminalAutoOpenKey: string }) | null
    >(null);

    const scheduleTerminalAutoOpenRecoveryCheck = useCallback((key: string) => {
        window.setTimeout(() => {
            const latest = latestWorkspaceTerminalAutoOpenStateRef.current;
            if (!latest || latest.terminalAutoOpenKey !== key) {
                return;
            }

            /**
             * React StrictMode, route hydration, or review-runtime reseeding can
             * unmount the first terminal owner while its automatic start is still
             * in flight. The old owner correctly refuses to attach to the session,
             * but the new visible owner may have been blocked by the module-level
             * anti-hammer claim. If the terminal is still visibly idle after the
             * first open promise settles, allow a tiny bounded recovery retry.
             */
            if (
                !shouldAutoOpenWorkspaceTerminal({
                    ...latest,
                    autoOpenAlreadyRequested: false,
                })
            ) {
                return;
            }

            const attempts = terminalAutoOpenRetryCountsRef.current.get(key) ?? 0;
            if (attempts >= TERMINAL_AUTO_OPEN_MAX_RECOVERY_ATTEMPTS) {
                return;
            }

            terminalAutoOpenRetryCountsRef.current.set(key, attempts + 1);
            terminalAutoOpenRequestedKeyRef.current = null;
            setTerminalAutoOpenRetryTick((value) => value + 1);
        }, TERMINAL_AUTO_OPEN_VERIFY_DELAY_MS);
    }, []);

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
        if (terminalOnlyMode && outputTab !== "terminal") {
            setOutputTab("terminal");
        }
    }, [terminalOnlyMode, outputTab]);

    useEffect(() => {
        latestWorkspaceTerminalAutoOpenStateRef.current = {
            terminalAutoOpenKey,
            outputTab,
            workspaceTerminalEnabled,
            recoverState: workspaceTerm.recoverState,
            state: workspaceTerm.state,
            restarting: workspaceTerm.restarting,
            stopping: workspaceTerm.stopping,
            sessionId: workspaceTerm.sessionId,
            started: workspaceTerm.started,
            starting: workspaceTerm.starting,
            autoOpenAlreadyRequested:
                terminalAutoOpenRequestedKeyRef.current === terminalAutoOpenKey,
        };
    }, [
        outputTab,
        workspaceTerminalEnabled,
        workspaceTerm.recoverState,
        workspaceTerm.state,
        workspaceTerm.restarting,
        workspaceTerm.stopping,
        workspaceTerm.sessionId,
        workspaceTerm.started,
        workspaceTerm.starting,
        terminalAutoOpenKey,
    ]);

    useEffect(() => {
        if ((lang === "sql" || isWeb) && outputTab === "terminal") {
            setOutputTab("output");
        }
    }, [lang, isWeb, outputTab]);

    useEffect(() => {
        terminalAutoOpenRequestedKeyRef.current = null;
        terminalAutoOpenRetryCountsRef.current.delete(terminalAutoOpenKey);
    }, [
        terminalAutoOpenKey,
        workspaceTerminalEnabled,
    ]);

    useEffect(() => {
        if (workspaceTerm.sessionId || workspaceTerm.started || workspaceTerm.starting) {
            terminalAutoOpenRetryCountsRef.current.delete(terminalAutoOpenKey);
        }
    }, [
        terminalAutoOpenKey,
        workspaceTerm.sessionId,
        workspaceTerm.started,
        workspaceTerm.starting,
    ]);

    useEffect(() => {
        if (
            !shouldAutoOpenWorkspaceTerminal({
                outputTab,
                workspaceTerminalEnabled,
                recoverState: workspaceTerm.recoverState,
                state: workspaceTerm.state,
                restarting: workspaceTerm.restarting,
                stopping: workspaceTerm.stopping,
                sessionId: workspaceTerm.sessionId,
                started: workspaceTerm.started,
                starting: workspaceTerm.starting,
                autoOpenAlreadyRequested:
                    terminalAutoOpenRequestedKeyRef.current === terminalAutoOpenKey,
            })
        ) {
            return;
        }

        /**
         * Ref guards reset after React remounts. A module-level claim survives normal
         * remounts and prevents xterm crashes/HMR/recovery renders from hammering
         * the backend start endpoint until the user explicitly clicks Restart.
         */
        if (!shouldClaimTerminalAutoOpen(terminalAutoOpenKey)) {
            return;
        }

        let cancelled = false;

        const timer = window.setTimeout(() => {
            if (cancelled) {
                return;
            }

            terminalAutoOpenRequestedKeyRef.current = terminalAutoOpenKey;

            void workspaceTerm.open({ userInitiated: false }).finally(() => {
                releaseTerminalAutoOpenClaim(terminalAutoOpenKey);

                if (!cancelled) {
                    scheduleTerminalAutoOpenRecoveryCheck(terminalAutoOpenKey);
                }
            });
        }, TERMINAL_AUTO_OPEN_DELAY_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            releaseTerminalAutoOpenClaim(terminalAutoOpenKey);
        };
    }, [
        outputTab,
        workspaceTerminalEnabled,
        workspaceTerm.sessionId,
        workspaceTerm.started,
        workspaceTerm.starting,
        workspaceTerm.stopping,
        workspaceTerm.restarting,
        workspaceTerm.state,
        workspaceTerm.recoverState,
        workspaceTerm.open,
        terminalAutoOpenKey,
        terminalAutoOpenRetryTick,
        scheduleTerminalAutoOpenRecoveryCheck,
    ]);


    useEffect(() => {
        const nextFileId =
            typeof props.activeWorkspaceFileId === "string"
                ? props.activeWorkspaceFileId
                : null;
        const previousFileId = previousWorkspaceFileIdRef.current;
        const nextSelectionVersion =
            typeof props.workspaceFileSelectionVersion === "number"
                ? props.workspaceFileSelectionVersion
                : null;
        const previousSelectionVersion =
            previousWorkspaceFileSelectionVersionRef.current;

        previousWorkspaceFileIdRef.current = nextFileId;
        previousWorkspaceFileSelectionVersionRef.current = nextSelectionVersion;

        if (
            shouldOpenEditorForWorkspaceFileSelection({
                previousFileId,
                nextFileId,
                previousSelectionVersion,
                nextSelectionVersion,
                isNarrowScreen,
                showEditor,
                showTerminal,
            })
        ) {
            setMobilePane("editor");
        }
    }, [
        props.activeWorkspaceFileId,
        props.workspaceFileSelectionVersion,
        isNarrowScreen,
        showEditor,
        showTerminal,
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

            setOutputTab(runnerPaneDefaultTab);
            terminalAutoOpenRequestedKeyRef.current = null;
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
            runnerPaneDefaultTab,
            terminalOnlyMode,
            term,
        ],
    );

    const showPickerUI = showLanguagePicker && !fixedLanguage && allowedLangs.length > 1;
    const showSqlDialectPickerUI =
        lang === "sql" &&
        showSqlDialectPicker &&
        !fixedSqlDialect &&
        allowedDialects.length > 1;

    const showEditorThemeToggleUI =
        showEditorThemeToggle && showHeaderBar && showEditor && !terminalOnlyMode;

    const showDockToggleUI =
        !isNarrowScreen &&
        showTerminalDockToggle &&
        !fixedTerminalDock &&
        showHeaderBar &&
        showEditor &&
        showTerminal;
    const showOpenWorkspaceTerminalUI =
        showHeaderBar &&
        showOpenTerminalButton !== false &&
        workspaceTerminalEnabled &&
        !isWeb &&
        lang !== "sql" &&
        !terminalOnlyMode;
    const showRestartWorkspaceTerminalUI =
        showHeaderBar &&
        showRestartTerminalButton !== false &&
        workspaceTerminalEnabled &&
        !isWeb &&
        lang !== "sql";

    const outerCls = cx(
        frame === "plain"
            ? "flex h-full min-h-0 min-w-0 w-full flex-col"
            : "ui-card flex min-h-0 min-w-0 w-full flex-col p-3 sm:p-4",
        className,
    );

    const shouldFillParentHeight = frame === "plain" && height === "auto";
    const needsBoundedRunnerHeight = showEditor && showTerminal && !shouldFillParentHeight;
    const fallbackRegionHeight = isNarrowScreen
        ? "min(72dvh, 680px)"
        : "min(68dvh, 760px)";
    const keyboardBoundedRootHeight =
        isNarrowScreen &&
        mobileKeyboardOpen &&
        mobileKeyboardAvailableHeight != null
            ? Math.max(96, mobileKeyboardAvailableHeight)
            : null;
    const resolvedRootHeight =
        keyboardBoundedRootHeight != null
            ? `${keyboardBoundedRootHeight}px`
            : typeof height === "number"
                ? isNarrowScreen
                    ? `min(${numericHeight}px, 78dvh)`
                    : `${numericHeight}px`
                : needsBoundedRunnerHeight
                    ? fallbackRegionHeight
                    : undefined;

    const rootStyle: React.CSSProperties | undefined = resolvedRootHeight
        ? { height: resolvedRootHeight }
        : undefined;
    const regionStyle: React.CSSProperties | undefined =
        keyboardBoundedRootHeight != null || typeof height === "number"
            ? undefined
            : rootStyle;

    const outputLabel = isWeb ? t("previewTab") : lang === "sql" ? t("resultsTab") : t("outputTab");
    const mobileTabAttention = !isWeb && (term.runState !== "idle" || !!term.lastResult);
    const measuredSurfaceHeight = split.mainH || numericHeight;
    const keyboardChromeHeight =
        (showHeaderBar ? 48 : 0) +
        (showEditor && showTerminal ? 48 : 0) +
        12;
    const keyboardSurfaceCap =
        keyboardBoundedRootHeight != null
            ? Math.max(80, keyboardBoundedRootHeight - keyboardChromeHeight)
            : Number.POSITIVE_INFINITY;
    const minimumSurfaceHeight = mobileKeyboardOpen ? 80 : 240;
    const mobileBodyHeight = Math.max(
        minimumSurfaceHeight,
        Math.min(measuredSurfaceHeight - 48, keyboardSurfaceCap),
    );
    const surfaceBodyHeight = Math.max(
        minimumSurfaceHeight,
        Math.min(measuredSurfaceHeight, keyboardSurfaceCap),
    );

    const showStdinEditorUI =
        showStdinEditor && showEditor && !terminalOnlyMode && lang !== "sql" && !isWeb;
    const showWorkspaceTerminalTab = workspaceTerminalEnabled;
    const effectiveEditorLanguage = editorLanguage ?? (isWeb ? "html" : lang);
    const shouldCollapseIdleOutput = shouldCollapseIdleOutputPanel({
        compactLearnerUi: learnerUiFlags.compactLearnerUi,
        showEditor,
        showTerminal,
        terminalOnlyMode,
        isWeb,
        language: lang,
        outputTab,
        runner: term,
        workspaceTerminalEnabled,
        workspaceTerminal: workspaceTerm,
    });


    const selectWorkspaceTerminalTab = useCallback(
        (terminalId: string) => {
            setTerminalTabMessage(null);
            setPendingTerminalStartId(null);
            setActiveTerminalId(terminalId);
            setOutputTab("terminal");

            if (resolvedTerminalHostKey) {
                const ownerKey = buildWorkspaceTerminalOwnerKey({
                    hostKey: resolvedTerminalHostKey,
                    terminalId,
                });
                if (!terminalCapacity.hostActiveOwnerKeys.includes(ownerKey)) {
                    setPendingTerminalStartId(terminalId);
                }
            }

            if (isNarrowScreen && showEditor && showTerminal) {
                setMobilePane("output");
            }
        },
        [
            isNarrowScreen,
            resolvedTerminalHostKey,
            showEditor,
            showTerminal,
            terminalCapacity.hostActiveOwnerKeys,
        ],
    );

    const addWorkspaceTerminalTab = useCallback(async () => {
        if (!resolvedTerminalHostKey || disabled) return;

        const latestCapacity = await refreshTerminalCapacity();
        const maxActiveSessions =
            latestCapacity?.maxActiveSessions ?? terminalCapacity.maxActiveSessions;
        const activeCount = latestCapacity?.activeCount ?? terminalCapacity.activeCount;

        if (!activeWorkspaceTerminalReady || pendingTerminalStartId) {
            setTerminalTabMessage(
                "Wait for the current terminal to finish starting before opening another.",
            );
            return;
        }

        if (
            !canCreateWorkspaceTerminalTab({
                activeCount,
                terminalTabCount: terminalTabs.length,
                maxActiveSessions,
                activeTerminalReady: true,
            })
        ) {
            setTerminalTabMessage(
                `Terminal limit reached (${maxActiveSessions}). Close a terminal before opening another.`,
            );
            return;
        }

        const nextNumber =
            terminalTabs.reduce((max, tab) => {
                const match = tab.label.match(/(\d+)$/);
                return Math.max(max, match ? Number(match[1]) : 0);
            }, 0) + 1;
        const nextTab = createWorkspaceTerminalTab(nextNumber);

        setTerminalTabs((current) => [...current, nextTab]);
        setActiveTerminalId(nextTab.id);
        setPendingTerminalStartId(nextTab.id);
        setTerminalTabMessage(`Starting ${nextTab.label}…`);
        setOutputTab("terminal");
        terminalAutoOpenRequestedKeyRef.current = null;

        if (isNarrowScreen && showEditor && showTerminal) {
            setMobilePane("output");
        }
    }, [
        disabled,
        isNarrowScreen,
        refreshTerminalCapacity,
        resolvedTerminalHostKey,
        showEditor,
        showTerminal,
        terminalCapacity.activeCount,
        terminalCapacity.maxActiveSessions,
        terminalTabs,
        activeWorkspaceTerminalReady,
        pendingTerminalStartId,
    ]);

    const closeWorkspaceTerminalTab = useCallback(
        async (terminalId: string) => {
            if (!resolvedTerminalHostKey || terminalTabs.length <= 1) return;

            const ownerKey = buildWorkspaceTerminalOwnerKey({
                hostKey: resolvedTerminalHostKey,
                terminalId,
            });
            const closingIndex = terminalTabs.findIndex((tab) => tab.id === terminalId);
            const remaining = terminalTabs.filter((tab) => tab.id !== terminalId);
            const nextActive =
                terminalId === activeTerminalId
                    ? remaining[Math.max(0, Math.min(closingIndex, remaining.length - 1))]?.id
                    : activeTerminalId;

            setTerminalTabs(remaining);
            setActiveTerminalId(nextActive ?? remaining[0].id);
            if (pendingTerminalStartId === terminalId) {
                setPendingTerminalStartId(null);
            }
            setTerminalTabMessage(null);
            await cancelWorkspaceTerminalOwner(ownerKey);
            await refreshTerminalCapacity();
        },
        [
            activeTerminalId,
            refreshTerminalCapacity,
            resolvedTerminalHostKey,
            terminalTabs,
            pendingTerminalStartId,
        ],
    );

    const openWorkspaceTerminalPane = useCallback(async () => {
        setOutputTab("terminal");

        if (isNarrowScreen && showEditor && showTerminal) {
            setMobilePane("output");
        }

        if (!workspaceTerminalEnabled || disabled) {
            return;
        }

        terminalAutoOpenRequestedKeyRef.current = terminalAutoOpenKey;
        releaseTerminalAutoOpenClaim(terminalAutoOpenKey);

        await workspaceTerm.open({ userInitiated: true });
    }, [
        disabled,
        isNarrowScreen,
        showEditor,
        showTerminal,
        terminalAutoOpenKey,
        workspaceTerm,
        workspaceTerminalEnabled,
    ]);

    const outputModel: OutputSurfaceModel = useMemo(() => {
        if (isWeb) {
            return {
                kind: "web-preview",
                entries: webPreviewEntries,
                title: t("previewTab"),
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
                    recoverState={workspaceTerm.recoverState}
                    recoverMessage={workspaceTerm.recoverMessage}
                    restarting={workspaceTerm.restarting}
                    interactiveReady={workspaceTerm.interactiveReady}
                    cwdLabel={workspaceTerm.terminalEvidence.cwd ?? workspaceTerminal?.cwd ?? null}
                    captureInactiveInput={workspaceTerm.disconnectedInputGuardActive}
                    onRestart={() =>
                        restartWorkspaceTerminalSession({
                            resetAutoOpen: () => {
                                terminalAutoOpenRequestedKeyRef.current = null;
                                releaseTerminalAutoOpenClaim(terminalAutoOpenKey);
                            },
                            workspaceTerm,
                        })
                    }
                    onInactiveInputAttempt={workspaceTerm.handleDisconnectedInputAttempt}
                />
            );
        }

        return <OutputSurface model={outputModel} disabled={disabled} />;
    };

    const renderOutputPane = (panelHeight?: number, panelWidth?: number) => {
        return (
            <div
                data-testid={outputTestId}
                className={cx(
                    "min-h-0 flex flex-col",
                    terminalOnlyMode ? "h-full flex-1" : "",
                )}
                style={{
                    ...(typeof panelHeight === "number" ? { height: panelHeight } : {}),
                    ...(typeof panelWidth === "number" ? { width: panelWidth } : {}),
                }}
            >
                {showWorkspaceTerminalTab ? (
                    <div className={cx("p-2", PANEL_TABS)}>
                        <div className="flex min-w-0 items-center gap-2">
                            {!terminalOnlyMode ? (
                                <button
                                    type="button"
                                    onClick={() => setOutputTab("output")}
                                    className={cx(
                                        MOBILE_TAB_BASE,
                                        outputTab === "output"
                                            ? MOBILE_TAB_OUTPUT_ACTIVE
                                            : MOBILE_TAB_IDLE,
                                    )}
                                    aria-pressed={outputTab === "output"}
                                >
                                    {outputLabel}
                                    {mobileTabAttention && outputTab !== "output" ? (
                                        <span className="inline-flex h-2 w-2 rounded-full bg-sky-500" />
                                    ) : null}
                                </button>
                            ) : null}

                            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                                {terminalTabs.map((tab) => {
                                    const active =
                                        outputTab === "terminal" &&
                                        tab.id === activeTerminalId;

                                    return (
                                        <div
                                            key={tab.id}
                                            className={cx(
                                                "inline-flex shrink-0 items-center rounded-lg",
                                                active
                                                    ? MOBILE_TAB_ACTIVE
                                                    : MOBILE_TAB_IDLE,
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => selectWorkspaceTerminalTab(tab.id)}
                                                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold"
                                                aria-pressed={active}
                                            >
                                                <span>{tab.label}</span>
                                                {active &&
                                                activeWorkspaceTerminalReady ? (
                                                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                                ) : null}
                                            </button>

                                            {terminalTabs.length > 1 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void closeWorkspaceTerminalTab(tab.id);
                                                    }}
                                                    className="px-1.5 py-1 text-xs opacity-70 hover:opacity-100"
                                                    aria-label={`Close ${tab.label}`}
                                                >
                                                    ×
                                                </button>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    void addWorkspaceTerminalTab();
                                }}
                                disabled={
                                    disabled ||
                                    !canCreateWorkspaceTerminalTab({
                                        activeCount: terminalCapacity.activeCount,
                                        terminalTabCount: terminalTabs.length,
                                        maxActiveSessions:
                                            terminalCapacity.maxActiveSessions,
                                        activeTerminalReady:
                                            activeWorkspaceTerminalReady &&
                                            !pendingTerminalStartId,
                                    })
                                }
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-base font-bold text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/80"
                                aria-label="New terminal"
                                title={`New terminal (${terminalCapacity.activeCount}/${terminalCapacity.maxActiveSessions} active)`}
                            >
                                +
                            </button>

                            <span className="shrink-0 text-[10px] font-semibold text-neutral-500 dark:text-white/45">
                                {terminalCapacity.activeCount}/
                                {terminalCapacity.maxActiveSessions}
                            </span>
                        </div>

                        {terminalTabMessage ? (
                            <div className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                                {terminalTabMessage}
                            </div>
                        ) : null}
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
            {activeBinaryFile ? (
                <BinaryFileViewer
                    fileName={activeBinaryFile.name}
                    binary={activeBinaryFile.binary}
                />
            ) : (
                <>
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
                </>
            )}
        </div>
    );

    const renderCollapsedIdleOutputFooter = () => (
        <div className="border-t border-neutral-200 px-3 py-2 text-[11px] text-neutral-500 dark:border-white/10 dark:text-white/45">
            Output will appear after you run.
        </div>
    );

    return (
        <div ref={runnerRootRef} className={outerCls} data-testid={testId} style={rootStyle}>
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
                            setOutputTab(runnerPaneDefaultTab);
                            terminalAutoOpenRequestedKeyRef.current = null;
                            releaseTerminalAutoOpenClaim(terminalAutoOpenKey);
                            term.resetTerminal();
                            if (isNarrowScreen && showEditor && showTerminal) {
                                setMobilePane("editor");
                            }
                        }}
                        showOpenTerminal={showOpenWorkspaceTerminalUI}
                        onOpenTerminal={openWorkspaceTerminalPane}
                        showRestartTerminal={showRestartWorkspaceTerminalUI}
                        onRestartTerminal={() =>
                            restartWorkspaceTerminalSession({
                                resetAutoOpen: () => {
                                    terminalAutoOpenRequestedKeyRef.current = null;
                                    releaseTerminalAutoOpenClaim(terminalAutoOpenKey);
                                },
                                workspaceTerm,
                            })
                        }
                        allowRun={effectiveAllowRun && !terminalOnlyMode}
                        onRun={async () => {
                            if (isWeb) return;

                            setOutputTab(terminalOnlyMode ? "terminal" : "output");

                            if (isNarrowScreen && showEditor && showTerminal) {
                                setMobilePane("output");
                            }

                            const liveCode = readLiveEditorCode();
                            if (liveCode !== code) {
                                setCode(liveCode);
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
                        "flex-1",
                        isNarrowScreen ? "overscroll-y-auto touch-pan-y" : "overscroll-contain",
                        rootStyle ? "" : shouldFillParentHeight ? "" : height === "auto" ? "h-auto" : "",
                    ].join(" ")}
                >
                    {showEditor && !showTerminal ? renderEditorPane(surfaceBodyHeight) : null}

                    {!showEditor && showTerminal ? renderOutputPane(surfaceBodyHeight) : null}

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
                                        : shouldCollapseIdleOutput
                                            ? renderCollapsedIdleOutputFooter()
                                            : renderOutputPane(mobileBodyHeight)}
                                </div>
                            </div>
                        ) : shouldCollapseIdleOutput ? (
                            <div className="flex h-full min-h-0 flex-col">
                                <div className={cx("min-h-0 flex-1", PANEL_EDITOR)}>
                                    {renderEditorPane(surfaceBodyHeight)}
                                </div>
                                {renderCollapsedIdleOutputFooter()}
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
