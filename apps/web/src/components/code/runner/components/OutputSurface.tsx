"use client";

import React from "react";
import type { CodeRunnerController, WorkspaceSyncEntry } from "@/components/code/runner/runtime";
import RunnerOutputSurface from "./RunnerOutputSurface";
import SqlOutputSurface from "./SqlOutputSurface";
import WebPreview from "./WebPreview";

export type OutputSurfaceModel =
    | {
    kind: "runner";
    controller: CodeRunnerController;
}
    | {
    kind: "sql";
    controller: CodeRunnerController;
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
}
    | {
    kind: "web-preview";
    entries: WorkspaceSyncEntry[];
    title?: string;
};

export default function OutputSurface(props: {
    model: OutputSurfaceModel;
    disabled: boolean;
}) {
    const { model, disabled } = props;

    switch (model.kind) {
        case "sql":
            return (
                <SqlOutputSurface
                    controller={model.controller}
                    sqlSchemaSql={model.sqlSchemaSql}
                    sqlInitialTableSnapshots={model.sqlInitialTableSnapshots}
                    sqlViewKey={model.sqlViewKey}
                />
            );

        case "web-preview":
            return <WebPreview entries={model.entries} title={model.title} />;

        case "runner":
        default:
            return (
                <RunnerOutputSurface
                    controller={model.controller}
                    disabled={disabled}
                />
            );
    }
}