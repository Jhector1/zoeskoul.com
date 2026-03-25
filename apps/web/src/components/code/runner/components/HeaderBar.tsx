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
import { SiPython, SiJavascript, SiC, SiCplusplus } from "react-icons/si";
import { FaJava } from "react-icons/fa";
import { TbSql } from "react-icons/tb";
import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";

const LANG_META: Record<
    CodeLanguage,
    { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
    python: { label: "Python", Icon: SiPython },
    java: { label: "Java", Icon: FaJava },
    javascript: { label: "JavaScript", Icon: SiJavascript },
    c: { label: "C", Icon: SiC },
    cpp: { label: "C++", Icon: SiCplusplus },
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
            <span className="hidden @lg:inline-flex items-center gap-2">
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
    allowedLangs: CodeLanguage[];
    lang: CodeLanguage;
    onSwitchLang: (l: CodeLanguage) => void;

    showSqlDialectPicker: boolean;
    allowedSqlDialects: SqlDialect[];
    sqlDialect: SqlDialect;
    onSwitchSqlDialect: (d: SqlDialect) => void;

    allowReset: boolean;
    onReset: () => void;

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

        allowRun,
        onRun,
        onCancel,
    } = props;

    const themeIsDark = editorTheme === "vs-dark";
    const dockLabel = dock === "bottom" ? "Bottom" : "Right";

    const langMeta = LANG_META[lang] ?? { label: String(lang), Icon: FiCode };
    const LangIcon = langMeta.Icon;

    const btnBase =
        "inline-flex items-center justify-center rounded-xl border text-xs font-extrabold transition select-none";
    const btnPad = "p-2 @lg:px-3 @lg:py-1.5";
    const btnIdle =
        "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 " +
        "dark:border-white/10 dark:bg-white/[0.06] dark:text-white/80 dark:hover:bg-white/[0.10]";
    const btnDisabled = "disabled:opacity-50 disabled:cursor-not-allowed";
    const btnActive =
        "border-emerald-300/30 bg-emerald-300/10 text-neutral-900 dark:text-white/90";
    const btnRun =
        "border-sky-300/30 bg-sky-300/10 text-neutral-900 hover:bg-sky-300/15 dark:text-white/90";
    const btnStop =
        "border-rose-300/30 bg-rose-300/10 text-neutral-900 hover:bg-rose-300/15 dark:text-white/90";

    const selectCls =
        "rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-extrabold " +
        "text-neutral-700 outline-none transition hover:bg-neutral-50 " +
        "dark:border-white/10 dark:bg-white/[0.06] dark:text-white/80 dark:hover:bg-white/[0.10]";

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

    const runTip = runLabel;

    return (
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1 truncate text-sm font-black text-neutral-900 dark:text-white/90">
                {title}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
                {showEditorThemeToggle ? (
                    <Tooltip tip={themeIsDark ? "Editor theme: Dark" : "Editor theme: Light"}>
                        <button
                            type="button"
                            onClick={onToggleTheme}
                            disabled={disabled}
                            className={cx(btnBase, btnPad, btnIdle, btnDisabled)}
                            aria-label={themeIsDark ? "Editor theme: Dark" : "Editor theme: Light"}
                        >
                            <IconText
                                icon={
                                    themeIsDark ? (
                                        <FiMoon className="text-[14px]" />
                                    ) : (
                                        <FiSun className="text-[14px]" />
                                    )
                                }
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
                            className={cx(btnBase, btnPad, btnIdle, btnDisabled)}
                            aria-label={`Terminal dock: ${dockLabel}`}
                        >
                            <IconText icon={<FiTerminal className="text-[14px]" />} text={dockLabel} />
                        </button>
                    </Tooltip>
                ) : null}

                {showPicker ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <div className="hidden lg:block text-xs font-extrabold text-neutral-600 dark:text-white/60">
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
                                        className={cx(btnBase, btnPad, active ? btnActive : btnIdle, btnDisabled)}
                                        aria-label={meta.label}
                                    >
                                        <IconText icon={<Icon className="text-[14px]" />} text={meta.label} />
                                    </button>
                                </Tooltip>
                            );
                        })}
                    </div>
                ) : (
                    <Tooltip tip={`Language: ${langMeta.label}`}>
                        <div className="text-xs font-extrabold text-neutral-500 dark:text-white/60">
                            <IconText icon={<LangIcon className="text-[14px]" />} text={langMeta.label} />
                        </div>
                    </Tooltip>
                )}

                {lang === "sql" && showSqlDialectPicker ? (
                    <label className="flex items-center gap-2">
                        <span className="hidden lg:block text-xs font-extrabold text-neutral-600 dark:text-white/60">
                            Dialect
                        </span>
                        <select
                            value={sqlDialect}
                            onChange={(e) => onSwitchSqlDialect(e.target.value as SqlDialect)}
                            disabled={disabled || sessionActive}
                            className={cx(selectCls, btnDisabled)}
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
                        <div className="text-xs font-extrabold text-neutral-500 dark:text-white/60">
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
                            className={cx(btnBase, btnPad, btnIdle, btnDisabled)}
                            aria-label="Reset"
                        >
                            <IconText icon={<FiRefreshCw className="text-[14px]" />} text="Reset" />
                        </button>
                    </Tooltip>
                ) : null}

                {allowRun ? (
                    <Tooltip tip={runTip}>
                        <button
                            type="button"
                            disabled={disabled || showSpinner}
                            onClick={showStop ? onCancel : onRun}
                            className={cx(
                                btnBase,
                                btnPad,
                                showStop || showSpinner ? btnStop : btnRun,
                                btnDisabled,
                            )}
                            aria-label={runLabel}
                        >
                            <IconText
                                icon={
                                    showSpinner ? (
                                        <FiLoader className="text-[14px] animate-spin" />
                                    ) : showStop ? (
                                        <FiSquare className="text-[14px]" />
                                    ) : (
                                        <FiPlay className="text-[14px]" />
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