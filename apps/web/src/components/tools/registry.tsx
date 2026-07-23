"use client";

import React from "react";
import { NotebookPen, PenTool, TerminalSquare } from "lucide-react";
import type { ToolSpec, ToolsCtx } from "./types";
import CodeToolPane from "./panes/CodeToolPane";
import{ SqlDialect } from "@/lib/practice/types";
import {RunnerLanguage} from "@zoeskoul/code-contracts";
import NotesToolPane from "@/components/tools/panes/NotesToolPane";
import BoardToolPane from "@/components/tools/panes/BoardToolPane";
import type { ToolDocKey } from "@/components/tools/hooks/useToolDoc";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import type { ToolRunnerPanePolicy, ToolSurface } from "@zoeskoul/curriculum-contracts";

export type CodeToolProps = {
    height: number;
    editorOwnerKey?: string | null;
    toolScopeKey?: string;

    toolHydrated: boolean;
    toolLang: RunnerLanguage;
    toolCode: string;
    toolStdin: string;
    toolWorkspace?: WorkspaceStateV2 | null;
    toolSqlDialect?: SqlDialect;
    ideConfig?: LearningIdeConfig | null;

    /**
     * Controls every browser-local workspace persistence layer owned by the
     * CodeToolPane -> FullIDE stack. Review modules pass "off" so only the
     * runtime store and ReviewProgress DB can restore learner work.
     */
    draftStorageMode?: "off" | "local";

    onChangeLang?: (l: RunnerLanguage) => void;
    onChangeCode: (c: string) => void;
    onChangeStdin: (s: string) => void;
    onChangeWorkspace?: (workspace: WorkspaceStateV2 | null) => void;
    onChangeSqlDialect?: (d: SqlDialect) => void;

    onBeforeRun?: () => void | Promise<void>;

    sqlDatasetId?: string;
    sqlResultShape?: "table";
    sqlPaneOptions?: SqlPaneOptions;
    runnerPaneOptions?: ToolRunnerPanePolicy;
    defaultSurface?: ToolSurface;
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


export type BoardToolProps = {
    boardKey: ToolDocKey;
    readOnly?: boolean;
    documentEndpoint?: string;
    documentRequestKey?: Record<string, string>;
    documentRefreshMs?: number;
};

export type NotesToolProps = {
    noteKey: {
        subjectSlug: string;
        moduleId: string;
        locale: string;
        toolId: string;
        scopeKey: string;
    };
    format?: "markdown" | "plain";
};

export const TOOL_SPECS: ToolSpec[] = [
    {
        id: "code",
        label: "Run",
        Icon: TerminalSquare,
        keepMounted: true,
        enabled: (ctx: ToolsCtx) => ctx.codeEnabled,
        isDefault: (ctx: ToolsCtx) => ctx.codeEnabled,
        render: (props: CodeToolProps) => <CodeToolPane {...props} />,
    },
    {
        id: "board",
        label: "Board",
        Icon: PenTool,
        keepMounted: true,
        enabled: (ctx: ToolsCtx) => ctx.boardEnabled,
        isDefault: (ctx: ToolsCtx) => !ctx.codeEnabled && ctx.boardEnabled,
        render: (props: BoardToolProps) => <BoardToolPane {...props} />,
    },
    {
        id: "notes",
        label: "Notes",
        Icon: NotebookPen,
        keepMounted: true,
        enabled: (ctx: ToolsCtx) => ctx.notesEnabled,
        isDefault: (ctx: ToolsCtx) => !ctx.codeEnabled && !ctx.boardEnabled && ctx.notesEnabled,
        render: (props: NotesToolProps) => <NotesToolPane {...props} />,
    },
];

export function getToolSpec(id: string) {
    return TOOL_SPECS.find((t) => t.id === id);
}
