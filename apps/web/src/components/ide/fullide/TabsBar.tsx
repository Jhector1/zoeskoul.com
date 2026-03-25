"use client";

import React, { useEffect, useRef } from "react";
import type { FileNode, FSNode, NodeId } from "../types";
import { cn } from "../utils";
import { pathOf } from "../fsTree";

export default function TabsBar(props: {
    nodes: FSNode[];
    tabFiles: FileNode[];
    activeFileId: NodeId|null;
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
            <div className="flex min-w-max items-center gap-2 px-2 py-2">
                {tabFiles.map((f, i) => {
                    const active = f.id === activeFileId;
                    const panelId = `ide-tabpanel-${f.id}`;
                    const tabId = `ide-tab-${f.id}`;

                    return (
                        <div
                            key={f.id}
                            className={cn(
                                "flex shrink-0 items-center gap-1 rounded-lg border",
                                "max-w-[220px] sm:max-w-[280px]",
                                "px-2 py-1.5 text-xs font-extrabold",
                                active
                                    ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white/90"
                                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/75 dark:hover:bg-white/[0.10]",
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
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-neutral-200 bg-white text-[11px] font-black text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/[0.10]"
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