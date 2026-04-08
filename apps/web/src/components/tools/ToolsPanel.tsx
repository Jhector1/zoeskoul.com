"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { ListIcon } from "lucide-react";

import { cx } from "./utils/cx";
import ToolTabs from "./ToolTabs";
import { TOOL_SPECS } from "./registry";
import type { ToolsCtx, ToolId } from "./types";
import { useActiveTool } from "./hooks/useActiveTool";
import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";

const PANE_ANIM = {
    show: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
    hide: { opacity: 0, scale: 0.985, y: 6, filter: "blur(2px)" },
};

const PANE_TRANSITION = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] as const };

export default function ToolsPanel(props: {
    onCollapse: () => void;
    onUnbind?: () => void;
    boundId?: string | null;

    rightBodyRef: React.RefObject<HTMLDivElement | null>;
    codeRunnerRegionH: number;

    toolLang: CodeLanguage;
    toolCode: string;
    toolStdin: string;
    toolSqlDialect: SqlDialect;
    onChangeCode: (c: string) => void;
    onChangeStdin: (s: string) => void;

    onBeforeRun?: () => void | Promise<void>;

    subjectSlug: string;
    moduleId: string;
    locale: string;
    codeEnabled: boolean;



    onChangeLang?: (l: CodeLanguage) => void;
    onChangeSqlDialect?: (d: SqlDialect) => void;

    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlInitialTableSnapshots?: Record<
        string,
        {
            name: string;
            columns: Array<{ name: string; type?: string | null }>;
            rows: unknown[][];
            rowCount: number;
        }
    >;
    showLanguagePicker?: boolean;
    showSqlDialectPicker?: boolean;
}) {
    const ctx: ToolsCtx = useMemo(
        () => ({
            subjectSlug: props.subjectSlug,
            moduleId: props.moduleId,
            locale: props.locale,
            boundId: props.boundId ?? null,
            codeEnabled: props.codeEnabled,
        }),
        [props.subjectSlug, props.moduleId, props.locale, props.boundId, props.codeEnabled],
    );

    const { active, setActive } = useActiveTool(ctx);

    const scopeKey = props.boundId ? `exercise:${props.boundId}` : "general";

    const noteKey = useMemo(
        () => ({
            subjectSlug: props.subjectSlug,
            moduleId: props.moduleId,
            locale: props.locale,
            toolId: "notes",
            scopeKey,
        }),
        [props.subjectSlug, props.moduleId, props.locale, scopeKey],
    );

    const keepMounted = TOOL_SPECS.filter((t) => t.keepMounted);

    return (
        <div className="flex h-full flex-col overflow-hidden ui-surface-muted rounded-none">
            <div className="shrink-0 border-b border-neutral-200 bg-white/80 p-3 backdrop-blur dark:border-white/10 dark:bg-black/30">
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-sm font-black text-neutral-800 dark:text-white/80">
                            Tools
                        </div>

                        {props.boundId ? (
                            <div className="mt-1 text-[11px] font-extrabold text-neutral-600 dark:text-white/60">
                                Bound to: <span className="font-black">{props.boundId}</span>
                                {props.onUnbind ? (
                                    <button
                                        type="button"
                                        onClick={props.onUnbind}
                                        className="ml-2 underline underline-offset-2"
                                    >
                                        Unbind
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            <div className="mt-1 text-[11px] font-extrabold text-neutral-600 dark:text-white/60">
                                Not bound
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <ToolTabs
                            ctx={ctx}
                            value={active}
                            onChange={(v: ToolId) => {
                                const spec = TOOL_SPECS.find((t) => t.id === v);
                                if (!spec) return;
                                if (!spec.enabled(ctx)) return;
                                setActive(v);
                            }}
                        />

                        <button
                            type="button"
                            className="ui-btn ui-btn-secondary px-3 py-2 text-[11px] font-extrabold"
                            title="Collapse tools"
                            onClick={props.onCollapse}
                        >
                            <ListIcon />
                        </button>
                    </div>
                </div>
            </div>

            <div ref={props.rightBodyRef} className="min-h-0 flex-1 overflow-hidden p-3">
                <div className="relative h-full min-h-0">
                    {keepMounted.map((spec) => {
                        const isActive = active === spec.id;

                        const pane =
                            spec.id === "code"
                                ?spec.render({
                                    height: props.codeRunnerRegionH,
                                    toolLang: props.toolLang,
                                    toolCode: props.toolCode,
                                    toolStdin: props.toolStdin,
                                    toolSqlDialect: props.toolSqlDialect,
                                    onChangeLang: props.onChangeLang,
                                    onChangeCode: props.onChangeCode,
                                    onChangeStdin: props.onChangeStdin,
                                    onChangeSqlDialect: props.onChangeSqlDialect,
                                    onBeforeRun: props.onBeforeRun,
                                    sqlSchemaSql: props.sqlSchemaSql,
                                    sqlSeedSql: props.sqlSeedSql,
                                    sqlSetupSql: props.sqlSetupSql,
                                    sqlInitialTableSnapshots: props.sqlInitialTableSnapshots,
                                    showLanguagePicker: props.showLanguagePicker,
                                    showSqlDialectPicker: props.showSqlDialectPicker,
                                })
                                : spec.id === "notes"
                                    ? spec.render({ noteKey, format: "markdown" })
                                    : null;

                        return (
                            <motion.div
                                key={spec.id}
                                className="absolute inset-0"
                                variants={PANE_ANIM}
                                animate={isActive ? "show" : "hide"}
                                transition={PANE_TRANSITION}
                                style={{ pointerEvents: isActive ? "auto" : "none" }}
                                aria-hidden={!isActive}
                            >
                                {spec.id === "code" && !ctx.codeEnabled ? (
                                    <div className="h-full rounded-xl border border-neutral-200 p-4 text-sm text-neutral-700 dark:border-white/10 dark:text-white/70">
                                        Code tool is disabled for this subject.
                                    </div>
                                ) : (
                                    pane
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}