"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { ListIcon } from "lucide-react";

import ToolTabs from "./ToolTabs";
import { TOOL_SPECS } from "./registry";
import type { ToolsCtx, ToolId } from "./types";
import { useActiveTool } from "./hooks/useActiveTool";
import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";

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
        <div className="flex h-full flex-col overflow-hidden ui-surface-muted rounded-none">
            <MemoToolsHeader
                ctx={ctx}
                active={active}
                setActive={setActive}
                boundId={props.boundId ?? null}
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
                         onUnbind,
                         onCollapse,
                     }: {
    ctx: ToolsCtx;
    active: ToolId;
    setActive: (v: ToolId) => void;
    boundId: string | null;
    onUnbind?: () => void;
    onCollapse: () => void;
}) {
    return (
        <div className="shrink-0 border-b border-neutral-200 bg-white/80 p-3 backdrop-blur dark:border-white/10 dark:bg-black/30">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-black text-neutral-800 dark:text-white/80">
                        Tools
                    </div>

                    {boundId ? (
                        <div className="mt-1 text-[6px] font-extrabold text-neutral-600 dark:text-white/60">
                            Bound to: <span className="font-black text-e">{boundId}</span>
                            {onUnbind ? (
                                <button
                                    type="button"
                                    onClick={onUnbind}
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
                        onClick={onCollapse}
                    >
                        <ListIcon />
                    </button>
                </div>
            </div>
        </div>
    );
}

const MemoToolsHeader = React.memo(
    ToolsHeader,
    (prev, next) =>
        prev.ctx === next.ctx &&
        prev.active === next.active &&
        prev.setActive === next.setActive &&
        prev.boundId === next.boundId &&
        prev.onUnbind === next.onUnbind &&
        prev.onCollapse === next.onCollapse,
);

function CodePaneLayer(props: {
    isActive: boolean;
    codeEnabled: boolean;
    height: number;
    editorOwnerKey?: string | null;
    toolScopeKey?: string;
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
