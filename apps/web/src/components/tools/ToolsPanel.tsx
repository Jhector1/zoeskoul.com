"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ListIcon, MoreHorizontal } from "lucide-react";

import ToolTabs from "./ToolTabs";
import { TOOL_SPECS } from "./registry";
import type { ToolsCtx, ToolId } from "./types";
import { useActiveTool } from "./hooks/useActiveTool";
import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";

const PANE_ANIM = {
    show: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
    hide: { opacity: 0, scale: 0.985, y: 6, filter: "blur(2px)" },
};

const PANE_TRANSITION = {
    duration: 0.18,
    ease: [0.2, 0.8, 0.2, 1] as const,
};

const CODE_SPEC = TOOL_SPECS.find((t) => t.id === "code");
const NOTES_SPEC = TOOL_SPECS.find((t) => t.id === "notes");

export type ToolsPanelProps = {
    onCollapse: () => void;
    onUnbind?: () => void;
    boundId?: string | null;
    pendingExerciseBinding?: boolean;
    editorOwnerKey?: string | null;
    toolScopeKey?: string;

    rightBodyRef: React.RefObject<HTMLDivElement | null>;
    codeRunnerRegionH: number;

    toolHydrated: boolean;
    toolLang: WorkspaceLanguage;
    toolCode: string;
    toolStdin: string;
    toolWorkspace?: WorkspaceStateV2 | null;
    toolSqlDialect: SqlDialect;
    ideConfig?: LearningIdeConfig | null;
    onChangeCode: (c: string) => void;
    onChangeStdin: (s: string) => void;
    onChangeWorkspace?: (workspace: WorkspaceStateV2 | null) => void;

    onBeforeRun?: () => void | Promise<void>;

    subjectSlug: string;
    moduleId: string;
    locale: string;
    codeEnabled: boolean;

    onChangeLang?: (l: WorkspaceLanguage) => void;
    onChangeSqlDialect?: (d: SqlDialect) => void;

    sqlDatasetId?: string;
    sqlResultShape?: "table";
    sqlPaneOptions?: SqlPaneOptions;
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
};

function ToolsPanelInner(props: ToolsPanelProps) {
    const t = useTranslations("ide.tools.header");
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

    const scopeKey = props.toolScopeKey ?? (props.boundId ? `exercise:${props.boundId}` : "general");



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

    return (
        <div className="flex h-full min-h-0 flex-col overflow-visible ui-surface-muted rounded-none">
            <MemoToolsHeader
                ctx={ctx}
                active={active}
                setActive={setActive}
                boundId={props.boundId ?? null}
                pendingExerciseBinding={props.pendingExerciseBinding === true}
                onUnbind={props.onUnbind}
                onCollapse={props.onCollapse}
            />

            <div ref={props.rightBodyRef} className="min-h-0 flex-1 overflow-hidden pt-1">
                <div className="relative h-full min-h-0">
                    <MemoCodePaneLayer
                        isActive={active === "code"}
                        codeEnabled={ctx.codeEnabled}
                        height={props.codeRunnerRegionH}
                        editorOwnerKey={props.editorOwnerKey}
                        toolScopeKey={scopeKey}
                        pendingExerciseBinding={props.pendingExerciseBinding === true}
                        toolHydrated={props.toolHydrated}
                        toolLang={props.toolLang}
                        toolCode={props.toolCode}
                        toolStdin={props.toolStdin}
                        toolWorkspace={props.toolWorkspace}
                        toolSqlDialect={props.toolSqlDialect}
                        ideConfig={props.ideConfig}
                        onChangeLang={props.onChangeLang}
                        onChangeCode={props.onChangeCode}
                        onChangeStdin={props.onChangeStdin}
                        onChangeWorkspace={props.onChangeWorkspace}
                        onChangeSqlDialect={props.onChangeSqlDialect}
                        onBeforeRun={props.onBeforeRun}
                        sqlDatasetId={props.sqlDatasetId}
                        sqlResultShape={props.sqlResultShape}
                        sqlPaneOptions={props.sqlPaneOptions}
                        sqlSchemaSql={props.sqlSchemaSql}
                        sqlSeedSql={props.sqlSeedSql}
                        sqlSetupSql={props.sqlSetupSql}
                        sqlInitialTableSnapshots={props.sqlInitialTableSnapshots}
                        showLanguagePicker={props.showLanguagePicker}
                        showSqlDialectPicker={props.showSqlDialectPicker}
                    />

                    <MemoNotesPaneLayer
                        isActive={active === "notes"}
                        noteKey={noteKey}
                    />
                </div>
            </div>
        </div>
    );
}

function ToolsHeader({
                         ctx,
                         active,
                         setActive,
                         boundId,
                         pendingExerciseBinding,
                         onUnbind,
                         onCollapse,
                     }: {
    ctx: ToolsCtx;
    active: ToolId;
    setActive: (v: ToolId) => void;
    boundId: string | null;
    pendingExerciseBinding: boolean;
    onUnbind?: () => void;
    onCollapse: () => void;
}) {
    const t = useTranslations("ide.tools.header");
    const showDebugLearningUi = learnerUiFlags.showDebugLearningUi;
    const compactToolsHeader =
        learnerUiFlags.compactLearnerUi && !learnerUiFlags.showDebugLearningUi;
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const { primarySpec, secondarySpecs } = resolveCompactToolsHeaderModel({
        compactToolsHeader,
        ctx,
    });

    useEffect(() => {
        if (!menuOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setMenuOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [menuOpen]);

    const activateTool = (v: ToolId) => {
        const spec = TOOL_SPECS.find((t) => t.id === v);
        if (!spec || !spec.enabled(ctx)) return;
        setActive(v);
        setMenuOpen(false);
    };

    return (
        <div className="relative z-20 shrink-0 border-b border-neutral-200 bg-white/80 p-3 backdrop-blur dark:border-white/10 dark:bg-black/30">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-black text-neutral-800 dark:text-white/80">
                        {t("title")}
                    </div>

                    {showDebugLearningUi && boundId ? (
                        <div className="mt-1 text-[6px] font-extrabold text-neutral-600 dark:text-white/60">
                            {t("boundTo")} <span className="font-black text-e">{boundId}</span>
                            {onUnbind ? (
                                <button
                                    type="button"
                                    onClick={onUnbind}
                                    className="ml-2 underline underline-offset-2"
                                >
                                    {t("unbind")}
                                </button>
                            ) : null}
                        </div>
                    ) : pendingExerciseBinding ? (
                        <div className="mt-1 text-[11px] font-extrabold text-neutral-600 dark:text-white/60">
                            {t("loadingExercise")}
                        </div>
                    ) : showDebugLearningUi ? (
                        <div className="mt-1 text-[11px] font-extrabold text-neutral-600 dark:text-white/60">
                            {t("notBound")}
                        </div>
                    ) : null}
                </div>

                <div className="flex items-center gap-2">
                    {compactToolsHeader ? (
                        <>
                            {primarySpec ? (
                                <button
                                    type="button"
                                    onClick={() => activateTool(primarySpec.id)}
                                    className="ui-btn ui-btn-secondary px-3 py-2 text-[11px] font-extrabold"
                                    aria-pressed={active === primarySpec.id}
                                    title={primarySpec.label}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <primarySpec.Icon className="h-4 w-4" />
                                        {primarySpec.label}
                                    </span>
                                </button>
                            ) : null}

                            <div ref={menuRef} className="relative">
                                <button
                                    type="button"
                                    className="ui-btn ui-btn-secondary px-3 py-2 text-[11px] font-extrabold"
                                    aria-label={t("moreOptions")}
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    onClick={() => setMenuOpen((open) => !open)}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <MoreHorizontal className="h-4 w-4" />
                                        {t("more")}
                                    </span>
                                </button>

                                {menuOpen ? (
                                    <div
                                        role="menu"
                                        aria-label={t("moreOptions")}
                                        className="absolute right-0 top-full z-20 mt-2 min-w-[12rem] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-white/10 dark:bg-neutral-950"
                                    >
                                        {secondarySpecs.map((spec) => (
                                            <button
                                                key={spec.id}
                                                type="button"
                                                role="menuitem"
                                                onClick={() => activateTool(spec.id)}
                                                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[11px] font-extrabold text-neutral-800 hover:bg-neutral-100 dark:text-white/80 dark:hover:bg-white/10"
                                            >
                                                <span className="inline-flex items-center gap-2">
                                                    <spec.Icon className="h-4 w-4" />
                                                    {spec.label}
                                                </span>
                                                {active === spec.id ? (
                                                    <span className="text-neutral-500 dark:text-white/45">
                                                        {t("open")}
                                                    </span>
                                                ) : null}
                                            </button>
                                        ))}

                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                onCollapse();
                                            }}
                                            className="flex w-full items-center gap-2 border-t border-neutral-200 px-3 py-2 text-left text-[11px] font-extrabold text-neutral-800 hover:bg-neutral-100 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10"
                                        >
                                            <ListIcon className="h-4 w-4" />
                                            {t("collapse")}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </>
                    ) : (
                        <>
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
                                title={t("collapse")}
                                onClick={onCollapse}
                            >
                                <ListIcon />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export function resolveCompactToolsHeaderModel(args: {
    compactToolsHeader: boolean;
    ctx: ToolsCtx;
}) {
    const enabledSpecs = TOOL_SPECS.filter((t) => t.enabled(args.ctx));
    const primarySpec =
        (args.ctx.codeEnabled ? TOOL_SPECS.find((t) => t.id === "code") : null) ??
        enabledSpecs[0] ??
        null;
    const secondarySpecs = args.compactToolsHeader
        ? enabledSpecs.filter((t) => t.id !== primarySpec?.id)
        : [];

    return {
        enabledSpecs,
        primarySpec,
        secondarySpecs,
    };
}

const MemoToolsHeader = React.memo(
    ToolsHeader,
    (prev, next) =>
        prev.ctx === next.ctx &&
        prev.active === next.active &&
        prev.setActive === next.setActive &&
        prev.boundId === next.boundId &&
        prev.pendingExerciseBinding === next.pendingExerciseBinding &&
        prev.onUnbind === next.onUnbind &&
        prev.onCollapse === next.onCollapse,
);

function CodePaneLayer(props: {
    isActive: boolean;
    codeEnabled: boolean;
    height: number;
    editorOwnerKey?: string | null;
    toolScopeKey?: string;
    pendingExerciseBinding?: boolean;
    toolHydrated: boolean;
    toolLang: WorkspaceLanguage;
    toolCode: string;
    toolStdin: string;
    toolWorkspace?: WorkspaceStateV2 | null;
    toolSqlDialect: SqlDialect;
    ideConfig?: LearningIdeConfig | null;
    onChangeLang?: (l: WorkspaceLanguage) => void;
    onChangeCode: (c: string) => void;
    onChangeStdin: (s: string) => void;
    onChangeWorkspace?: (workspace: WorkspaceStateV2 | null) => void;
    onChangeSqlDialect?: (d: SqlDialect) => void;
    onBeforeRun?: () => void | Promise<void>;
    sqlDatasetId?: string;
    sqlResultShape?: "table";
    sqlPaneOptions?: SqlPaneOptions;
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
    let pane: React.ReactNode = null;

    if (!props.codeEnabled) {
        pane = (
            <div className="h-full rounded-xl border border-neutral-200 p-4 text-sm text-neutral-700 dark:border-white/10 dark:text-white/70">
                Code tool is disabled for this subject.
            </div>
        );
    } else if (CODE_SPEC) {
        pane = CODE_SPEC.render({
            height: props.height,
            editorOwnerKey: props.editorOwnerKey,
            toolScopeKey: props.toolScopeKey,
            pendingExerciseBinding: props.pendingExerciseBinding,
            toolHydrated: props.toolHydrated,
            toolLang: props.toolLang,
            toolCode: props.toolCode,
            toolStdin: props.toolStdin,
            toolWorkspace: props.toolWorkspace,
            toolSqlDialect: props.toolSqlDialect,
            ideConfig: props.ideConfig,
            onChangeLang: props.onChangeLang,
            onChangeCode: props.onChangeCode,
            onChangeStdin: props.onChangeStdin,
            onChangeWorkspace: props.onChangeWorkspace,
            onChangeSqlDialect: props.onChangeSqlDialect,
            onBeforeRun: props.onBeforeRun,
            sqlDatasetId: props.sqlDatasetId,
            sqlResultShape: props.sqlResultShape,
            sqlPaneOptions: props.sqlPaneOptions,
            sqlSchemaSql: props.sqlSchemaSql,
            sqlSeedSql: props.sqlSeedSql,
            sqlSetupSql: props.sqlSetupSql,
            sqlInitialTableSnapshots: props.sqlInitialTableSnapshots,
            showLanguagePicker: props.showLanguagePicker,
            showSqlDialectPicker: props.showSqlDialectPicker,
        });
    }

    return (
        <motion.div
            className="absolute inset-0"
            variants={PANE_ANIM}
            animate={props.isActive ? "show" : "hide"}
            transition={PANE_TRANSITION}
            style={{ pointerEvents: props.isActive ? "auto" : "none" }}
            aria-hidden={!props.isActive}
        >
            {pane}
        </motion.div>
    );
}

const MemoCodePaneLayer = React.memo(
    CodePaneLayer,
    (prev, next) =>
        prev.isActive === next.isActive &&
        prev.codeEnabled === next.codeEnabled &&
        prev.height === next.height &&
        prev.editorOwnerKey === next.editorOwnerKey &&
        prev.toolScopeKey === next.toolScopeKey &&
        prev.pendingExerciseBinding === next.pendingExerciseBinding &&
        prev.toolHydrated === next.toolHydrated &&
        prev.toolLang === next.toolLang &&
        prev.toolCode === next.toolCode &&
        prev.toolStdin === next.toolStdin &&
        prev.toolWorkspace === next.toolWorkspace &&
        prev.toolSqlDialect === next.toolSqlDialect &&
        prev.ideConfig === next.ideConfig &&
        prev.onChangeLang === next.onChangeLang &&
        prev.onChangeCode === next.onChangeCode &&
        prev.onChangeStdin === next.onChangeStdin &&
        prev.onChangeWorkspace === next.onChangeWorkspace &&
        prev.onChangeSqlDialect === next.onChangeSqlDialect &&
        prev.onBeforeRun === next.onBeforeRun &&
        prev.sqlDatasetId === next.sqlDatasetId &&
        prev.sqlResultShape === next.sqlResultShape &&
        prev.sqlPaneOptions === next.sqlPaneOptions &&
        prev.sqlSchemaSql === next.sqlSchemaSql &&
        prev.sqlSeedSql === next.sqlSeedSql &&
        prev.sqlSetupSql === next.sqlSetupSql &&
        prev.sqlInitialTableSnapshots === next.sqlInitialTableSnapshots &&
        prev.showLanguagePicker === next.showLanguagePicker &&
        prev.showSqlDialectPicker === next.showSqlDialectPicker,
);

function NotesPaneLayer(props: {
    isActive: boolean;
    noteKey: {
        subjectSlug: string;
        moduleId: string;
        locale: string;
        toolId: string;
        scopeKey: string;
    };
}) {
    const pane = NOTES_SPEC ? NOTES_SPEC.render({ noteKey: props.noteKey, format: "markdown" }) : null;

    return (
        <motion.div
            className="absolute inset-0"
            variants={PANE_ANIM}
            animate={props.isActive ? "show" : "hide"}
            transition={PANE_TRANSITION}
            style={{ pointerEvents: props.isActive ? "auto" : "none" }}
            aria-hidden={!props.isActive}
        >
            {pane}
        </motion.div>
    );
}

const MemoNotesPaneLayer = React.memo(
    NotesPaneLayer,
    (prev, next) =>
        prev.isActive === next.isActive &&
        prev.noteKey === next.noteKey,
);

function areToolsPanelPropsEqual(prev: ToolsPanelProps, next: ToolsPanelProps) {
    return (
        prev.onCollapse === next.onCollapse &&
        prev.onUnbind === next.onUnbind &&
        prev.boundId === next.boundId &&
        prev.editorOwnerKey === next.editorOwnerKey &&
        prev.toolScopeKey === next.toolScopeKey &&
        prev.rightBodyRef === next.rightBodyRef &&
        prev.codeRunnerRegionH === next.codeRunnerRegionH &&
        prev.toolLang === next.toolLang &&
        prev.toolCode === next.toolCode &&
        prev.toolStdin === next.toolStdin &&
        prev.toolWorkspace === next.toolWorkspace &&
        prev.toolSqlDialect === next.toolSqlDialect &&
        prev.ideConfig === next.ideConfig &&
        prev.onChangeCode === next.onChangeCode &&
        prev.onChangeStdin === next.onChangeStdin &&
        prev.onChangeWorkspace === next.onChangeWorkspace &&
        prev.onBeforeRun === next.onBeforeRun &&
        prev.subjectSlug === next.subjectSlug &&
        prev.moduleId === next.moduleId &&
        prev.locale === next.locale &&
        prev.codeEnabled === next.codeEnabled &&
        prev.onChangeLang === next.onChangeLang &&
        prev.onChangeSqlDialect === next.onChangeSqlDialect &&
        prev.sqlDatasetId === next.sqlDatasetId &&
        prev.sqlResultShape === next.sqlResultShape &&
        prev.sqlPaneOptions === next.sqlPaneOptions &&
        prev.sqlSchemaSql === next.sqlSchemaSql &&
        prev.sqlSeedSql === next.sqlSeedSql &&
        prev.sqlSetupSql === next.sqlSetupSql &&
        prev.sqlInitialTableSnapshots === next.sqlInitialTableSnapshots &&
        prev.showLanguagePicker === next.showLanguagePicker &&
        prev.showSqlDialectPicker === next.showSqlDialectPicker
    );
}

const ToolsPanel = React.memo(ToolsPanelInner, areToolsPanelPropsEqual);

export default ToolsPanel;
