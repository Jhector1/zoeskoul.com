"use client";

import React from "react";
import type { RunResult } from "@/lib/code/types";
import type { TerminalChunk } from "../hooks/useCodeRunnerController";
import PlainTerminal from "./PlainTerminal";
import XtermTerminal from "./XtermTerminal";

export type TerminalMode = "plain" | "xterm";

function getDefaultTerminalMode(): TerminalMode {
    const value = process.env.NEXT_PUBLIC_TERMINAL_MODE?.trim().toLowerCase();
    return value === "xterm" ? "xterm" : "plain";
}

export default function TerminalSurface(props: {
    mode?: TerminalMode;
    terminalFeed: TerminalChunk[];
    inputEnabled: boolean;
    busy: boolean;
    disabled: boolean;
    lastResult: RunResult | null;
    onSendData: (data: string) => void;
    onResize: (cols: number, rows: number) => void;
}) {
    const {
        mode = getDefaultTerminalMode(),
        terminalFeed,
        inputEnabled,
        busy,
        disabled,
        lastResult,
        onSendData,
        onResize,
    } = props;

    if (mode === "xterm") {
        return (
            <XtermTerminal
                terminalFeed={terminalFeed}
                inputEnabled={inputEnabled}
                busy={busy}
                disabled={disabled}
                lastResult={lastResult}
                onSendData={onSendData}
                onResize={onResize}
            />
        );
    }

    return (
        <PlainTerminal
            terminalFeed={terminalFeed}
            inputEnabled={inputEnabled}
            busy={busy}
            disabled={disabled}
            lastResult={lastResult}
            onSendData={onSendData}
        />
    );
}