"use client";

import React from "react";
import {
    SiPython,
    SiJavascript,
    SiC,
    SiCplusplus,
    SiHtml5,
} from "react-icons/si";
import { FaJava } from "react-icons/fa6";
import { TbSql } from "react-icons/tb";
import { WorkspaceLanguage } from "@/lib/practice/types";

function cn(...cls: Array<string | false | undefined | null>) {
    return cls.filter(Boolean).join(" ");
}

type LangItem = {
    id: WorkspaceLanguage;
    label: string;
    desc: string;
    Icon: React.ComponentType<{ className?: string }>;
};

export const LANGS: LangItem[] = [
    { id: "python", label: "Python", desc: "Best for quick practice", Icon: SiPython },
    { id: "java", label: "Java", desc: "OOP + interviews", Icon: FaJava },
    { id: "javascript", label: "JavaScript", desc: "Web scripting", Icon: SiJavascript },
    { id: "web", label: "Web", desc: "HTML + CSS + JS", Icon: SiHtml5 },
    { id: "c", label: "C", desc: "Low-level fundamentals", Icon: SiC },
    { id: "cpp", label: "C++", desc: "Performance + STL", Icon: SiCplusplus },
    { id: "sql", label: "SQL", desc: "Queries + databases", Icon: TbSql },
];

export function LangRail(props: {
    lang: WorkspaceLanguage;
    setLang: (l: WorkspaceLanguage) => void;
    collapsed: boolean;
    onToggleCollapsed: () => void;
}) {
    const { lang, setLang, collapsed, onToggleCollapsed } = props;

    return (
        <aside className="flex h-full w-full flex-col bg-white dark:bg-neutral-950">
            <div className="border-b border-neutral-200 px-3 py-2.5 dark:border-white/10">
                <div className="flex items-center justify-between gap-2">
                    <div
                        className={cn(
                            "min-w-0 overflow-hidden transition-all duration-200 ease-out",
                            collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100",
                        )}
                    >
                        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-white/40">
                            Languages
                        </div>
                        <div className="mt-1 text-sm font-medium text-neutral-900 dark:text-white/90">
                            Programming IDE
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-neutral-500 dark:text-white/45">
                            Switch workspace
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onToggleCollapsed}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white/90"
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        <span
                            className={cn(
                                "text-sm font-medium transition-transform duration-200",
                                collapsed ? "rotate-180" : "rotate-0",
                            )}
                        >
                            ‹
                        </span>
                    </button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                    {LANGS.map((l) => {
                        const active = l.id === lang;
                        const Icon = l.Icon;

                        return (
                            <button
                                key={l.id}
                                type="button"
                                onClick={() => setLang(l.id)}
                                title={collapsed ? l.label : `${l.label} — ${l.desc}`}
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md text-left transition-colors",
                                    collapsed ? "justify-center px-2 py-2.5" : "px-2.5 py-2.5",
                                    active
                                        ? "bg-neutral-100 text-neutral-900 dark:bg-white/[0.08] dark:text-white/90"
                                        : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/70 dark:hover:bg-white/[0.06] dark:hover:text-white/90",
                                )}
                            >
                                <div className="grid h-8 w-8 shrink-0 place-items-center">
                                    <Icon
                                        className={cn(
                                            "h-4 w-4",
                                            active
                                                ? "text-neutral-900 dark:text-white/90"
                                                : "text-neutral-600 dark:text-white/65",
                                        )}
                                    />
                                </div>

                                <div
                                    className={cn(
                                        "min-w-0 flex-1 overflow-hidden transition-all duration-200 ease-out",
                                        collapsed ? "max-w-0 opacity-0" : "max-w-[160px] opacity-100",
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div
                                            className={cn(
                                                "truncate text-[12px] font-medium",
                                                active
                                                    ? "text-neutral-900 dark:text-white/90"
                                                    : "text-neutral-800 dark:text-white/75",
                                            )}
                                        >
                                            {l.label}
                                        </div>

                                        <div
                                            className={cn(
                                                "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase",
                                                active
                                                    ? "bg-white text-neutral-600 dark:bg-white/[0.08] dark:text-white/60"
                                                    : "text-neutral-400 dark:text-white/35",
                                            )}
                                        >
                                            {l.id}
                                        </div>
                                    </div>

                                    <div
                                        className={cn(
                                            "mt-0.5 truncate text-[11px] font-medium",
                                            active
                                                ? "text-neutral-500 dark:text-white/50"
                                                : "text-neutral-500 dark:text-white/40",
                                        )}
                                    >
                                        {l.desc}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="border-t border-neutral-200 dark:border-white/10">
                <div
                    className={cn(
                        "overflow-hidden px-3 transition-all duration-200 ease-out",
                        collapsed ? "max-h-0 py-0 opacity-0" : "max-h-20 py-2.5 opacity-100",
                    )}
                >
                    <div className="text-[11px] font-medium text-neutral-500 dark:text-white/45">
                        Each language keeps its own workspace.
                    </div>
                </div>
            </div>
        </aside>
    );
}