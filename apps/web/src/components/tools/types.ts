import type React from "react";
import type { LucideIcon } from "lucide-react";

export type ToolId = "code" | "notes"; // add more later

export type ToolsCtx = {
    subjectSlug: string;
    moduleId: string;
    locale: string;
    boundId?: string | null;

    // policy:
    codeEnabled: boolean;
};

export type ToolSpec = {
    id: ToolId;
    label: string;
    Icon: LucideIcon;

    /** if true, pane stays mounted (best for Monaco/CodeRunner) */
    keepMounted?: boolean;

    /** whether tab is selectable for this context */
    enabled: (ctx: ToolsCtx) => boolean;

    /** which tool should be default for this ctx */
    isDefault: (ctx: ToolsCtx) => boolean;

    /** render pane */
    render: (props: any) => React.ReactNode;
};