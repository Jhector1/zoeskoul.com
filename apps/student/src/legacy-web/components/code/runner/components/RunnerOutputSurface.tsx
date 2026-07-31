"use client";

import React from "react";
import type { CodeRunnerController } from "@/components/code/runner/runtime";
import { resolveSurfaceKind } from "@/components/code/runner/runtime";

import PlainTerminal from "./PlainTerminal";
import XtermTerminal from "./XtermTerminal";
import TerminalPane from "./TerminalPane";

function IdlePane(props: { label: string }) {
    return (
        <div className="ui-terminal-surface flex h-full min-h-0 flex-col justify-end p-3">
            <div className="ui-meta">{props.label} idle</div>
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

export default function RunnerOutputSurface(props: {
    controller: CodeRunnerController;
    disabled: boolean;
}) {
    const { controller, disabled } = props;

    const surface = resolveSurfaceKind(controller);

    if (!hasRenderableOutput(controller)) {
        return <IdlePane label="Output" />;
    }

    if (surface === "terminal-pane") {
        const t = controller.transcript;
        if (!t) return <IdlePane label="Output" />;

        return (
            <div className="h-full min-h-0">
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
            </div>
        );
    }

    if (surface === "plain") {
        const s = controller.stream;
        if (!s) return <IdlePane label="Output" />;

        return (
            <div className="h-full min-h-0">
                <PlainTerminal
                    terminalFeed={s.terminalFeed}
                    inputEnabled={s.inputEnabled}
                    busy={controller.busy}
                    disabled={disabled}
                    lastResult={controller.lastResult as any}
                    onSendData={s.sendTerminalData}
                />
            </div>
        );
    }

    const s = controller.stream;
    if (!s) return <IdlePane label="Output" />;

    return (
        <div className="h-full min-h-0">
            <XtermTerminal
                terminalFeed={s.terminalFeed}
                inputEnabled={s.inputEnabled}
                busy={controller.busy}
                disabled={disabled}
                lastResult={controller.lastResult as any}
                onSendData={s.sendTerminalData}
                onResize={s.sendTerminalResize}
            />
        </div>
    );
}
