"use client";

import React from "react";
import { isSqlRunResult } from "@/lib/code/types";
import type { CodeRunnerController } from "@/components/code/runner/runtime";
import { resolveSurfaceKind } from "@/components/code/runner/runtime";

import PlainTerminal from "./PlainTerminal";
import XtermTerminal from "./XtermTerminal";
import SqlResultsPane from "./SqlResultsPane";
import TerminalPane from "./TerminalPane";

function IdlePane(props: { label: string }) {
    return (
        <div className="ui-terminal-surface p-3">
            <div className="ui-meta">{props.label} idle</div>
        </div>
    );
}

function SqlErrorPane(props: { message: string }) {
    return (
        <div className="ui-surface-danger p-4">
            <div className="text-sm font-medium text-rose-800 dark:text-rose-200">
                SQL run error
            </div>

            <pre className="mt-2 whitespace-pre-wrap break-words text-[12px] font-medium text-rose-800 dark:text-rose-200">
        {props.message}
      </pre>
        </div>
    );
}

function hasRenderableOutput(controller: CodeRunnerController) {
    if (controller.backend === "sql") return true;

    if (controller.backend === "judge0") {
        return (
            controller.busy ||
            !!controller.lastResult ||
            !!controller.transcript?.awaitingInput ||
            (controller.transcript?.terminal.length ?? 0) > 0
        );
    }

    return (
        controller.busy ||
        !!controller.lastResult ||
        !!controller.stream?.inputEnabled ||
        (controller.stream?.terminalFeed.length ?? 0) > 0
    );
}

export default function TerminalSurface(props: {
    controller: CodeRunnerController;
    disabled: boolean;
    sqlSchemaSql?: string;
}) {
    const { controller, disabled, sqlSchemaSql = "" } = props;

    const surface = resolveSurfaceKind(controller);

    if (surface === "sql") {
        const sqlResult =
            controller.lastRunLanguage === "sql" && isSqlRunResult(controller.lastResult)
                ? controller.lastResult
                : null;

        const genericSqlError =
            controller.lastRunLanguage === "sql" &&
            controller.lastResult &&
            !isSqlRunResult(controller.lastResult)
                ? controller.lastResult
                : null;

        if (genericSqlError) {
            return (
                <SqlErrorPane
                    message={genericSqlError.error ?? genericSqlError.status ?? "SQL run failed."}
                />
            );
        }

        return (
            <SqlResultsPane
                result={sqlResult}
                busy={controller.busy}
                schemaSql={sqlSchemaSql}
            />
        );
    }

    if (!hasRenderableOutput(controller)) {
        return <IdlePane label="Terminal" />;
    }

    if (surface === "terminal-pane") {
        const t = controller.transcript;
        if (!t) return <IdlePane label="Terminal" />;

        return (
            <TerminalPane
                terminal={t.terminal}
                stdinBuffer={t.stdinBuffer}
                awaitingInput={t.awaitingInput}
                inputPrompt={t.inputPrompt}
                inputLine={t.inputLine}
                setInputLine={t.setInputLine}
                inputRef={t.inputRef}
                busy={controller.busy}
                runState={controller.runState}
                disabled={disabled}
                lastResult={controller.lastResult as any}
                onSubmitInput={t.submitInput}
                typedLines={t.typedLines}
            />
        );
    }

    if (surface === "plain") {
        const s = controller.stream;
        if (!s) return <IdlePane label="Terminal" />;

        return (
            <PlainTerminal
                terminalFeed={s.terminalFeed}
                inputEnabled={s.inputEnabled}
                busy={controller.busy}
                disabled={disabled}
                lastResult={controller.lastResult as any}
                onSendData={s.sendTerminalData}
            />
        );
    }

    const s = controller.stream;
    if (!s) return <IdlePane label="Terminal" />;

    return (
        <XtermTerminal
            terminalFeed={s.terminalFeed}
            inputEnabled={s.inputEnabled}
            busy={controller.busy}
            disabled={disabled}
            lastResult={controller.lastResult as any}
            onSendData={s.sendTerminalData}
            onResize={s.sendTerminalResize}
        />
    );
}