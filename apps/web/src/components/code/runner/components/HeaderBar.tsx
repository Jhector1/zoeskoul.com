"use client";

import React from "react";
import type { TerminalDock, RunnerState } from "../types";
import Tooltip from "@/components/ui/Tooltip";
import {
    FiMoon,
    FiSun,
    FiTerminal,
    FiRefreshCw,
    FiPlay,
    FiLoader,
    FiCode,
    FiSquare,
} from "react-icons/fi";
import { SiPython, SiJavascript, SiC, SiCplusplus, SiHtml5 } from "react-icons/si";
import { FaJava } from "react-icons/fa";
import { TbSql } from "react-icons/tb";
import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";

const LANG_META: Record<
    WorkspaceLanguage,
    { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
    python: { label: "Python", Icon: SiPython },
    java: { label: "Java", Icon: FaJava },
    javascript: { label: "JavaScript", Icon: SiJavascript },
    web: { label: "Web", Icon: SiHtml5 },
    c: { label: "C", Icon: SiC },
    cpp: { label: "C++", Icon: SiCplusplus },
    bash: { label: "Bash", Icon: FiTerminal },
    sql: { label: "SQL", Icon: TbSql },
};

const DIALECT_LABEL: Record<SqlDialect, string> = {
    postgres: "PostgreSQL",
    mysql: "MySQL",
    sqlite: "SQLite",
    mssql: "SQL Server",
};

function cx(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

function IconText({ icon, text }: { icon: React.ReactNode; text: React.ReactNode }) {
    return (
        <span className="inline-flex items-center">
            <span className="inline-flex @lg:hidden">{icon}</span>
            <span className="hidden @lg:inline-flex items-center gap-1.5">
                {icon}
                <span className="whitespace-nowrap">{text}</span>
            </span>
        </span>
    );
}

export default function HeaderBar(props: {
    title: string;
    disabled: boolean;
    busy: boolean;
    runState: RunnerState;
    onCancel: () => void;

    editorTheme: "vs" | "vs-dark";
    onToggleTheme: () => void;
    showEditorThemeToggle: boolean;

    dock: TerminalDock;
    onToggleDock: () => void;
    showDockToggle: boolean;

    showPicker: boolean;
    allowedLangs: WorkspaceLanguage[];
    lang: WorkspaceLanguage;
    onSwitchLang: (l: WorkspaceLanguage) => void;

    showSqlDialectPicker: boolean;
    allowedSqlDialects: SqlDialect[];
    sqlDialect: SqlDialect;
    onSwitchSqlDialect: (d: SqlDialect) => void;

    allowReset: boolean;
    onReset: () => void;
    showOpenTerminal?: boolean;
    onOpenTerminal?: () => void | Promise<void>;
    showRestartTerminal?: boolean;
    onRestartTerminal?: () => void | Promise<void>;

    allowRun: boolean;
    onRun: () => void;
}) {
    const {
        title,
        disabled,
        runState,
        editorTheme,
        onToggleTheme,
        showEditorThemeToggle,
        dock,
        onToggleDock,
        showDockToggle,
        showPicker,
        allowedLangs,
        lang,
        onSwitchLang,
        showSqlDialectPicker,
        allowedSqlDialects,
        sqlDialect,
        onSwitchSqlDialect,
        allowReset,
        onReset,
        showOpenTerminal,
        onOpenTerminal,
        showRestartTerminal,
        onRestartTerminal,
        allowRun,
        onRun,
        onCancel,
    } = props;

    const themeIsDark = editorTheme === "vs-dark";
    const dockLabel = dock === "bottom" ? "Bottom" : "Right";

    const langMeta = LANG_META[lang] ?? { label: String(lang), Icon: FiCode };
    const LangIcon = langMeta.Icon;

    const isStarting = runState === "starting";
    const isRunning = runState === "running";
    const isAwaitingInput = runState === "awaiting_input";
    const isCanceling = runState === "canceling";
    const isIdle = runState === "idle";

    const showSpinner = isStarting || isCanceling;
    const showStop = isRunning || isAwaitingInput;
    const sessionActive = !isIdle;

    const runLabel = isStarting
        ? "Preparing…"
        : isCanceling
            ? "Canceling…"
            : showStop
                ? "Stop"
                : "Run";

    return (
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900 dark:text-white/90">
                {title}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:ml-auto">
                {showEditorThemeToggle ? (
                    <Tooltip tip={themeIsDark ? "Editor theme: Dark" : "Editor theme: Light"}>
                        <button
                            type="button"
                            onClick={onToggleTheme}
                            disabled={disabled}
                            className="ui-btn-ide-ghost"
                            aria-label={themeIsDark ? "Editor theme: Dark" : "Editor theme: Light"}
                        >
                            <IconText
                                icon={themeIsDark ? <FiMoon className="text-[13px]" /> : <FiSun className="text-[13px]" />}
                                text={themeIsDark ? "Dark" : "Light"}
                            />
                        </button>
                    </Tooltip>
                ) : null}

                {showDockToggle ? (
                    <Tooltip tip={`Terminal dock: ${dockLabel}`}>
                        <button
                            type="button"
                            onClick={onToggleDock}
                            disabled={disabled || sessionActive}
                            className="ui-btn-ide-ghost"
                            aria-label={`Terminal dock: ${dockLabel}`}
                        >
                            <IconText icon={<FiTerminal className="text-[13px]" />} text={dockLabel} />
                        </button>
                    </Tooltip>
                ) : null}

                {showPicker ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <div className="hidden lg:block text-[11px] font-medium text-neutral-500 dark:text-white/45">
                            Language
                        </div>

                        {allowedLangs.map((l) => {
                            const meta = LANG_META[l] ?? { label: String(l), Icon: FiCode };
                            const Icon = meta.Icon;
                            const active = lang === l;

                            return (
                                <Tooltip key={l} tip={meta.label}>
                                    <button
                                        type="button"
                                        disabled={disabled || sessionActive}
                                        onClick={() => onSwitchLang(l)}
                                        className={active ? "ui-btn-ide-active" : "ui-btn-ide-ghost"}
                                        aria-label={meta.label}
                                    >
                                        <IconText icon={<Icon className="text-[13px]" />} text={meta.label} />
                                    </button>
                                </Tooltip>
                            );
                        })}
                    </div>
                ) : learnerUiFlags.compactLearnerUi ? null : (
                    <Tooltip tip={`Language: ${langMeta.label}`}>
                        <div className="text-[11px] font-medium text-neutral-500 dark:text-white/50">
                            <IconText icon={<LangIcon className="text-[13px]" />} text={langMeta.label} />
                        </div>
                    </Tooltip>
                )}

                {lang === "sql" && showSqlDialectPicker ? (
                    <label className="flex items-center gap-1.5">
                        <span className="hidden lg:block text-[11px] font-medium text-neutral-500 dark:text-white/45">
                            Dialect
                        </span>
                        <select
                            value={sqlDialect}
                            onChange={(e) => onSwitchSqlDialect(e.target.value as SqlDialect)}
                            disabled={disabled || sessionActive}
                            className="ui-select-ide"
                            aria-label="SQL dialect"
                        >
                            {allowedSqlDialects.map((d) => (
                                <option key={d} value={d}>
                                    {DIALECT_LABEL[d]}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}

                {lang === "sql" && !showSqlDialectPicker ? (
                    <Tooltip tip={`Dialect: ${DIALECT_LABEL[sqlDialect]}`}>
                        <div className="text-[11px] font-medium text-neutral-500 dark:text-white/50">
                            {DIALECT_LABEL[sqlDialect]}
                        </div>
                    </Tooltip>
                ) : null}

                {allowReset ? (
                    <Tooltip tip="Reset">
                        <button
                            type="button"
                            disabled={disabled || sessionActive}
                            onClick={onReset}
                            className="ui-btn-ide-ghost"
                            aria-label="Reset"
                        >
                            <IconText icon={<FiRefreshCw className="text-[13px]" />} text="Reset" />
                        </button>
                    </Tooltip>
                ) : null}

                {showOpenTerminal ? (
                    <Tooltip tip="Open terminal">
                        <button
                            type="button"
                            onClick={() => {
                                void onOpenTerminal?.();
                            }}
                            disabled={disabled}
                            className="ui-btn-ide-ghost"
                            aria-label="Open terminal"
                        >
                            <IconText icon={<FiTerminal className="text-[13px]" />} text="Terminal" />
                        </button>
                    </Tooltip>
                ) : null}

                {showRestartTerminal ? (
                    <Tooltip tip="Restart terminal">
                        <button
                            type="button"
                            onClick={() => {
                                void onRestartTerminal?.();
                            }}
                            disabled={disabled}
                            className="ui-btn-ide-ghost"
                            aria-label="Restart terminal"
                        >
                            <IconText icon={<FiRefreshCw className="text-[13px]" />} text="Restart terminal" />
                        </button>
                    </Tooltip>
                ) : null}

                {allowRun ? (
                    <Tooltip tip={runLabel}>
                        <button
                            type="button"
                            data-testid="code-runner-run-button"
                            disabled={disabled || showSpinner}
                            onClick={showStop ? onCancel : onRun}
                            className={cx(showStop || showSpinner ? "ui-btn-ide-danger" : "ui-btn-ide-success")}
                            aria-label={runLabel}
                        >
                            <IconText
                                icon={
                                    showSpinner ? (
                                        <FiLoader className="text-[13px] animate-spin" />
                                    ) : showStop ? (
                                        <FiSquare className="text-[13px]" />
                                    ) : (
                                        <FiPlay className="text-[13px]" />
                                    )
                                }
                                text={runLabel}
                            />
                        </button>
                    </Tooltip>
                ) : null}
            </div>
        </div>
    );
}
