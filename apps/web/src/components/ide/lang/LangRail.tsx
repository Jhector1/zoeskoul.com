"use client";

import React from "react";
import {
    SiPython,
    SiJavascript,
    SiC,
    SiCplusplus,
} from "react-icons/si";
import { FaJava } from "react-icons/fa6";
import { CodeLanguage } from "@/lib/practice/types";
import {TbSql} from "react-icons/tb";

function cn(...cls: Array<string | false | undefined | null>) {
    return cls.filter(Boolean).join(" ");
}

type LangItem = {
    id: CodeLanguage;
    label: string;
    desc: string;
    Icon: React.ComponentType<{ className?: string }>;
};

export const LANGS: LangItem[] = [
    { id: "python", label: "Python", desc: "Best for quick practice", Icon: SiPython },
    { id: "java", label: "Java", desc: "OOP + interviews", Icon: FaJava },
    { id: "javascript", label: "JavaScript", desc: "Web scripting", Icon: SiJavascript },
    { id: "c", label: "C", desc: "Low-level fundamentals", Icon: SiC },
    { id: "cpp", label: "C++", desc: "Performance + STL", Icon: SiCplusplus },
    { id: "sql", label: "SQL", desc: "Queries + databases", Icon: TbSql },
];

export function LangRail(props: {
    lang: CodeLanguage;
    setLang: (l: CodeLanguage) => void;
    collapsed: boolean;
    onToggleCollapsed: () => void;
}) {
    const { lang, setLang, collapsed, onToggleCollapsed } = props;

    return (
        <aside className="flex h-full w-full flex-col bg-white dark:bg-neutral-950">
            {/* Header */}
            <div className="border-b border-neutral-200 px-3 py-3 dark:border-white/10">
                <div className="flex items-center justify-between gap-2">
                    <div
                        className={cn(
                            "min-w-0 overflow-hidden transition-all duration-300 ease-in-out",
                            collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100",
                        )}
                    >
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-neutral-500 dark:text-white/40">
                            Languages
                        </div>
                        <div className="mt-1 text-sm font-black text-neutral-900 dark:text-white/90">
                            Programming IDE
                        </div>
                        <div className="mt-1 text-xs font-semibold text-neutral-500 dark:text-white/50">
                            Switch language workspace
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onToggleCollapsed}
                        className="grid h-10 w-10 shrink-0 place-items-center border border-neutral-200 bg-white text-neutral-700 transition hover:bg-neutral-50 rounded-none dark:border-white/10 dark:bg-neutral-950 dark:text-white/80 dark:hover:bg-white/[0.05]"
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        <span
                            className={cn(
                                "text-base font-black transition-transform duration-300",
                                collapsed ? "rotate-180" : "rotate-0",
                            )}
                        >
                            ‹
                        </span>
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="space-y-2">
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
                                    "w-full border text-left transition-all duration-200 rounded-none",
                                    "flex items-center gap-3",
                                    collapsed ? "justify-center px-2 py-3" : "px-3 py-3",
                                    active
                                        ? "border-emerald-600/25 bg-emerald-500/10"
                                        : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-950 dark:hover:bg-white/[0.05]",
                                )}
                            >
                                <div
                                    className={cn(
                                        "grid h-11 w-11 shrink-0 place-items-center border rounded-none",
                                        active
                                            ? "border-emerald-600/20 bg-emerald-500/10"
                                            : "border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]",
                                    )}
                                >
                                    <Icon
                                        className={cn(
                                            "h-5 w-5",
                                            active
                                                ? "text-emerald-700 dark:text-emerald-300"
                                                : "text-neutral-700 dark:text-white/75",
                                        )}
                                    />
                                </div>

                                <div
                                    className={cn(
                                        "min-w-0 flex-1 overflow-hidden transition-all duration-300 ease-in-out",
                                        collapsed ? "max-w-0 opacity-0" : "max-w-[160px] opacity-100",
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div
                                            className={cn(
                                                "truncate text-sm font-black",
                                                active
                                                    ? "text-neutral-900 dark:text-white/90"
                                                    : "text-neutral-800 dark:text-white/80",
                                            )}
                                        >
                                            {l.label}
                                        </div>

                                        <div
                                            className={cn(
                                                "shrink-0 border px-2 py-[2px] text-[10px] font-black uppercase rounded-none",
                                                active
                                                    ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                                                    : "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/45",
                                            )}
                                        >
                                            {l.id}
                                        </div>
                                    </div>

                                    <div
                                        className={cn(
                                            "mt-1 truncate text-xs font-semibold",
                                            active
                                                ? "text-neutral-600 dark:text-white/65"
                                                : "text-neutral-500 dark:text-white/45",
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

            {/* Footer */}
            <div className="border-t border-neutral-200 dark:border-white/10">
                <div
                    className={cn(
                        "overflow-hidden px-4 transition-all duration-300 ease-in-out",
                        collapsed ? "max-h-0 py-0 opacity-0" : "max-h-24 py-3 opacity-100",
                    )}
                >
                    <div className="text-[11px] font-extrabold text-neutral-500 dark:text-white/45">
                        Note
                    </div>
                    <div className="mt-1 text-xs font-semibold text-neutral-500 dark:text-white/45">
                        Each language keeps its own saved workspace.
                    </div>
                </div>
            </div>
        </aside>
    );
}