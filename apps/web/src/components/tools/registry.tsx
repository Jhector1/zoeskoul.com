"use client";

import React from "react";
import { NotebookPen, TerminalSquare } from "lucide-react";
import type { ToolSpec, ToolsCtx } from "./types";
import CodeToolPane from "./panes/CodeToolPane";
import NotesToolPane from "./panes/NotesToolPane";

export type CodeToolProps = {
    height: number;
    toolLang: any;
    toolCode: string;
    toolStdin: string;
    onChangeCode: (c: string) => void;
    onChangeStdin: (s: string) => void;
    onBeforeRun?: () => void | Promise<void>;
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
        id: "notes",
        label: "Notes",
        Icon: NotebookPen,
        keepMounted: true,
        enabled: (_ctx: ToolsCtx) => true,
        isDefault: (ctx: ToolsCtx) => !ctx.codeEnabled,
        render: (props: NotesToolProps) => <NotesToolPane {...props} />,
    },
];

export function getToolSpec(id: string) {
    return TOOL_SPECS.find((t) => t.id === id);
}