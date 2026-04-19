"use client";

import React from "react";
import type { CodeRunnerController } from "@/components/code/runner/runtime";
import OutputSurface from "./OutputSurface";

export default function TerminalSurface(props: {
    controller: CodeRunnerController;
    disabled: boolean;
    sqlSchemaSql?: string;
    sqlInitialTableSnapshots?: Record<
        string,
        {
            name: string;
            columns: Array<{ name: string; type?: string | null }>;
            rows: unknown[][];
            rowCount: number;
        }
    >;
    sqlViewKey?: string;
}) {
    const {
        controller,
        disabled,
        sqlSchemaSql,
        sqlInitialTableSnapshots,
        sqlViewKey,
    } = props;

    const model =
        controller.backend === "sql"
            ? {
                kind: "sql" as const,
                controller,
                sqlSchemaSql,
                sqlInitialTableSnapshots,
                sqlViewKey,
            }
            : {
                kind: "runner" as const,
                controller,
            };

    return <OutputSurface model={model} disabled={disabled} />;
}