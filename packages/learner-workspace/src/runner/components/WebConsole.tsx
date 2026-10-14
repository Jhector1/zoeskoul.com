"use client";

import React, { useEffect, useRef } from "react";

import type {
    WebPreviewConsoleEntry,
    WebPreviewSerializedValue,
} from "./webPreviewBridge";

function renderValue(value: WebPreviewSerializedValue): React.ReactNode {
    if (value === null) return <span className="text-fuchsia-600 dark:text-fuchsia-300">null</span>;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
        return <span className="text-blue-700 dark:text-blue-300">{String(value)}</span>;
    }

    switch (value.type) {
        case "undefined":
            return <span className="text-neutral-500">undefined</span>;
        case "bigint":
            return <span className="text-blue-700 dark:text-blue-300">{value.value}n</span>;
        case "symbol":
            return value.value;
        case "function":
            return <span className="italic">ƒ {value.name}()</span>;
        case "circular":
            return <span className="text-neutral-500">[Circular]</span>;
        case "truncated":
            return <span className="text-neutral-500">[…]</span>;
        case "dom-node":
            return <span className="text-violet-700 dark:text-violet-300">{value.value}</span>;
        case "error":
            return (
                <span className="whitespace-pre-wrap text-red-700 dark:text-red-300">
                    {value.name}: {value.message}
                </span>
            );
        case "array":
            return (
                <span>
                    [
                    {value.items.map((item, index) => (
                        <React.Fragment key={index}>
                            {index > 0 ? ", " : null}
                            {renderValue(item)}
                        </React.Fragment>
                    ))}
                    {value.truncated ? ", …" : ""}]
                </span>
            );
        case "object":
            return (
                <span>
                    {"{"}
                    {value.entries.map(([key, item], index) => (
                        <React.Fragment key={`${key}:${index}`}>
                            {index > 0 ? ", " : null}
                            <span className="text-violet-700 dark:text-violet-300">{key}</span>
                            {": "}
                            {renderValue(item)}
                        </React.Fragment>
                    ))}
                    {value.truncated ? ", …" : ""}
                    {"}"}
                </span>
            );
    }
}

const LEVEL_PRESENTATION = {
    log: { icon: "›", row: "", label: "Log" },
    info: { icon: "ⓘ", row: "text-blue-800 dark:text-blue-200", label: "Info" },
    warn: { icon: "⚠", row: "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200", label: "Warning" },
    error: { icon: "×", row: "bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200", label: "Error" },
    debug: { icon: "◇", row: "text-neutral-500 dark:text-neutral-400", label: "Debug" },
} as const;

function sourceLabel(entry: WebPreviewConsoleEntry) {
    if (!entry.source) return "";
    const file = entry.source.split(/[\\/]/).pop() || entry.source;
    return `${file}${entry.line ? `:${entry.line}` : ""}${entry.column ? `:${entry.column}` : ""}`;
}

export default function WebConsole(props: {
    entries: WebPreviewConsoleEntry[];
    open: boolean;
    unreadCount: number;
    onOpenChange: (open: boolean) => void;
    onClear: () => void;
}) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const stickToBottomRef = useRef(true);

    useEffect(() => {
        if (!props.open || !stickToBottomRef.current) return;
        const node = scrollRef.current;
        if (node) node.scrollTop = node.scrollHeight;
    }, [props.entries, props.open]);

    return (
        <section
            aria-label="Browser console"
            className="shrink-0 border-t border-neutral-200 bg-white text-neutral-800 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
            data-web-preview-console
        >
            <div className="flex h-9 items-center gap-2 px-2">
                <button
                    type="button"
                    aria-expanded={props.open}
                    aria-controls="web-preview-console-output"
                    onClick={() => props.onOpenChange(!props.open)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-white/10"
                >
                    <span aria-hidden="true">{props.open ? "▾" : "▸"}</span>
                    <span>Console</span>
                    {props.entries.length > 0 ? (
                        <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] tabular-nums dark:bg-neutral-800">
                            {props.unreadCount > 0 ? props.unreadCount : props.entries.length}
                        </span>
                    ) : null}
                </button>
                <button
                    type="button"
                    onClick={props.onClear}
                    disabled={props.entries.length === 0}
                    className="rounded px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/10"
                >
                    Clear
                </button>
            </div>

            {props.open ? (
                <div
                    id="web-preview-console-output"
                    ref={scrollRef}
                    role="log"
                    aria-live="polite"
                    onScroll={(event) => {
                        const node = event.currentTarget;
                        stickToBottomRef.current =
                            node.scrollHeight - node.scrollTop - node.clientHeight < 24;
                    }}
                    className="h-36 overflow-auto border-t border-neutral-200 font-mono text-[11px] leading-5 dark:border-white/10"
                >
                    {props.entries.length === 0 ? (
                        <div className="px-3 py-2 text-neutral-500">Console output will appear here.</div>
                    ) : (
                        props.entries.map((entry) => {
                            const presentation = LEVEL_PRESENTATION[entry.level];
                            const location = sourceLabel(entry);
                            return (
                                <div
                                    key={entry.id}
                                    className={`flex gap-2 border-b border-neutral-100 px-3 py-1 dark:border-white/5 ${presentation.row}`}
                                >
                                    <span
                                        aria-label={presentation.label}
                                        title={presentation.label}
                                        className="w-3 shrink-0 select-none text-center font-bold"
                                    >
                                        {presentation.icon}
                                    </span>
                                    <div className="min-w-0 flex-1 break-words whitespace-pre-wrap">
                                        {entry.arguments.map((argument, index) => (
                                            <React.Fragment key={index}>
                                                {index > 0 ? " " : null}
                                                {renderValue(argument)}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    {location ? (
                                        <span className="shrink-0 text-[10px] text-neutral-500">
                                            {location}
                                        </span>
                                    ) : null}
                                </div>
                            );
                        })
                    )}
                </div>
            ) : null}
        </section>
    );
}
