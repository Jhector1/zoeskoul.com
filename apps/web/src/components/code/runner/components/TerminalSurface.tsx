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
        <div className="h-full rounded-2xl border-t p-3 bg-white/80 dark:bg-black/40 border-neutral-200 dark:border-white/10">
            <div className="text-[11px] font-extrabold text-neutral-500 dark:text-white/50">
                {props.label} idle
            </div>
        </div>
    );
}

function hasRenderableOutput(controller: CodeRunnerController) {
    if (controller.backend === "sql") {
        // Always render SQL surface so SqlResultsPane can show
        // "No SQL result yet" before the first run.
        return true;
    }

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
}) {
    const { controller, disabled } = props;

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

        return genericSqlError ? (
            <div className="rounded-2xl border border-rose-300/30 bg-rose-50/70 p-4 text-sm text-rose-700 dark:border-rose-300/20 dark:bg-rose-950/20 dark:text-rose-200">
                <div className="font-black">SQL run error</div>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
                    {genericSqlError.error ?? genericSqlError.status ?? "SQL run failed."}
                </pre>
            </div>
        ) : (
            <SqlResultsPane result={sqlResult} busy={controller.busy} />
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