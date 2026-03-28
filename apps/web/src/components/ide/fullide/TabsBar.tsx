"use client";

import React, { useEffect, useRef } from "react";
import type { FileNode, FSNode, NodeId } from "../types";
import { cn } from "../utils";
import { pathOf } from "../fsTree";

export default function TabsBar(props: {
    nodes: FSNode[];
    tabFiles: FileNode[];
    activeFileId: NodeId | null;
    setActiveFileId: (id: NodeId) => void;
    closeTab: (id: NodeId) => void;
}) {
    const { nodes, tabFiles, activeFileId, setActiveFileId, closeTab } = props;
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const moveFocus = (fromIndex: number, dir: -1 | 1) => {
        if (!tabFiles.length) return;
        const next = (fromIndex + dir + tabFiles.length) % tabFiles.length;
        const btn = tabRefs.current[next];
        btn?.focus();
        btn?.scrollIntoView({ block: "nearest", inline: "nearest" });
        setActiveFileId(tabFiles[next].id);
    };

    useEffect(() => {
        const idx = tabFiles.findIndex((f) => f.id === activeFileId);
        if (idx === -1) return;
        tabRefs.current[idx]?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
        });
    }, [activeFileId, tabFiles]);

    return (
        <div
            role="tablist"
            aria-label="Open files"
            className="min-w-0 overflow-x-auto overflow-y-hidden"
        >
            <div className="flex min-w-max items-center gap-1 px-1.5 py-1.5">
                {tabFiles.map((f, i) => {
                    const active = f.id === activeFileId;
                    const panelId = `ide-tabpanel-${f.id}`;
                    const tabId = `ide-tab-${f.id}`;

                    return (
                        <div
                            key={f.id}
                            className={cn(
                                "flex shrink-0 items-center gap-1 rounded-md border",
                                "max-w-[180px] sm:max-w-[220px]",
                                "px-2 py-1 text-[11px] font-medium",
                                active
                                    ? "border-neutral-300 bg-neutral-100 text-neutral-900 dark:border-white/15 dark:bg-white/[0.08] dark:text-white/90"
                                    : "border-transparent bg-transparent text-neutral-600 hover:border-neutral-200 hover:bg-neutral-50 dark:text-white/60 dark:hover:border-white/10 dark:hover:bg-white/[0.05]"
                            )}
                        >
                            <button
                                ref={(el) => {
                                    tabRefs.current[i] = el;
                                }}
                                id={tabId}
                                role="tab"
                                aria-selected={active}
                                aria-controls={panelId}
                                tabIndex={active ? 0 : -1}
                                type="button"
                                onClick={() => setActiveFileId(f.id)}
                                onKeyDown={(e) => {
                                    if (e.key === "ArrowRight") {
                                        e.preventDefault();
                                        moveFocus(i, 1);
                                    }
                                    if (e.key === "ArrowLeft") {
                                        e.preventDefault();
                                        moveFocus(i, -1);
                                    }
                                    if (e.key === "Home") {
                                        e.preventDefault();
                                        tabRefs.current[0]?.focus();
                                        tabRefs.current[0]?.scrollIntoView({
                                            block: "nearest",
                                            inline: "nearest",
                                        });
                                        setActiveFileId(tabFiles[0].id);
                                    }
                                    if (e.key === "End") {
                                        e.preventDefault();
                                        const last = tabFiles.length - 1;
                                        tabRefs.current[last]?.focus();
                                        tabRefs.current[last]?.scrollIntoView({
                                            block: "nearest",
                                            inline: "nearest",
                                        });
                                        setActiveFileId(tabFiles[last].id);
                                    }
                                }}
                                title={pathOf(nodes, f.id)}
                                className="min-w-0 flex-1 truncate text-left outline-none"
                            >
                                {f.name}
                            </button>

                            <button
                                type="button"
                                onClick={() => closeTab(f.id)}
                                aria-label={`Close ${f.name}`}
                                title={`Close ${f.name}`}
                                className="grid h-4 w-4 shrink-0 place-items-center rounded text-[10px] font-medium text-neutral-400 hover:bg-black/5 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/75"
                            >
                                ×
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}