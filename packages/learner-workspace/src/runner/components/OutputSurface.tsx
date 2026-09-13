"use client";

import React from "react";
import type { CodeRunnerController, WorkspaceSyncEntry } from "@zoeskoul/learner-workspace/runner/runtime";
import RunnerOutputSurface from "@zoeskoul/learner-workspace/runner/components/RunnerOutputSurface";
import SqlOutputSurface from "@zoeskoul/learner-workspace/runner/components/SqlOutputSurface";
import type { SqlPaneOptions } from "@zoeskoul/learner-workspace/runner/components/sql/results-pane/index";
import WebPreview from "@zoeskoul/learner-workspace/runner/components/WebPreview";

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
    sqlPaneOptions?: SqlPaneOptions;
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
                <div className="h-full min-h-0">
                    <SqlOutputSurface
                        controller={model.controller}
                        sqlSchemaSql={model.sqlSchemaSql}
                        sqlInitialTableSnapshots={model.sqlInitialTableSnapshots}
                        sqlViewKey={model.sqlViewKey}
                        sqlPaneOptions={model.sqlPaneOptions}
                    />
                </div>
            );

        case "web-preview":
            return (
                <div className="h-full min-h-0">
                    <WebPreview entries={model.entries} title={model.title} />
                </div>
            );

        case "runner":
        default:
            return (
                <div className="h-full min-h-0">
                    <RunnerOutputSurface
                        controller={model.controller}
                        disabled={disabled}
                    />
                </div>
            );
    }
}
