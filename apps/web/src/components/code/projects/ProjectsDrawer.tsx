"use client";

import React, { useMemo, useState } from "react";
import type { ProjectSummary } from "@/lib/projects/projectApiTypes";
import { cn } from "@/components/ide/utils";
import type { CodeLanguage } from "@/lib/practice/types";

type ScopeFilter = "all" | "recent" | "personal" | "module" | "assignment" | "template";
type LanguageFilter = "current" | "all";

function formatWhen(iso: string) {
    const dt = new Date(iso);
    return dt.toLocaleString();
}

function scopeLabel(scopeKind: string) {
    switch (scopeKind) {
        case "module":
            return "Module";
        case "assignment":
            return "Assignment";
        case "template":
            return "Template";
        default:
            return "Personal";
    }
}

function languageLabel(language: string) {
    switch (language) {
        case "javascript":
            return "JavaScript";
        case "cpp":
            return "C++";
        case "c":
            return "C";
        case "python":
            return "Python";
        case "java":
            return "Java";
        case "sql":
            return "SQL";
        default:
            return language;
    }
}

export default function ProjectsDrawer(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentProjectId: string | null;
    currentProjectTitle: string;
    currentLanguage: CodeLanguage;
    canCreateProjects: boolean;
    loading: boolean;
    error: string | null;
    projects: ProjectSummary[];
    onRefresh: () => void;
    onSelectProject: (projectId: string) => void;
    onCreateBlankProject: () => void;
    onSaveAsProject: () => void;
    onRenameProject: (project: ProjectSummary) => void;
    onArchiveProject: (projectId: string) => void;
}) {
    const {
        open,
        onOpenChange,
        currentProjectId,
        currentProjectTitle,
        currentLanguage,
        canCreateProjects,
        loading,
        error,
        projects,
        onRefresh,
        onSelectProject,
        onCreateBlankProject,
        onSaveAsProject,
        onRenameProject,
        onArchiveProject,
    } = props;

    const [query, setQuery] = useState("");
    const [scope, setScope] = useState<ScopeFilter>("all");
    const [languageFilter, setLanguageFilter] = useState<LanguageFilter>("current");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();

        let base = projects.filter((p) => {
            if (languageFilter === "current" && p.language !== currentLanguage) {
                return false;
            }

            if (!q) return true;

            return (
                p.title.toLowerCase().includes(q) ||
                (p.description ?? "").toLowerCase().includes(q) ||
                p.language.toLowerCase().includes(q) ||
                p.scopeKind.toLowerCase().includes(q)
            );
        });

        if (scope === "recent") {
            return base.slice(0, 8);
        }

        if (scope !== "all") {
            base = base.filter((p) => p.scopeKind === scope);
        }

        return base;
    }, [projects, query, scope, languageFilter, currentLanguage]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/35">
            <button
                type="button"
                aria-label="Close projects panel"
                className="flex-1 cursor-default"
                onClick={() => onOpenChange(false)}
            />

            <aside className="flex h-full w-full max-w-[460px] flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-950">
                <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-4 dark:border-white/10">
                    <div className="min-w-0">
                        <div className="text-xs font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                            Projects
                        </div>
                        <div className="truncate text-sm font-extrabold text-neutral-900 dark:text-white">
                            Current: {currentProjectTitle}
                        </div>
                        <div className="mt-1 text-[11px] font-semibold text-neutral-500 dark:text-white/45">
                            Filtering by: {languageLabel(currentLanguage)}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="ui-btn ui-btn-secondary"
                    >
                        Close
                    </button>
                </div>

                <div className="space-y-3 border-b border-neutral-200 p-4 dark:border-white/10">
                    <div className="flex gap-2">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search projects…"
                            className="h-10 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-emerald-400 dark:border-white/10 dark:bg-black/30 dark:text-white/85"
                        />

                        <button
                            type="button"
                            onClick={onRefresh}
                            className="ui-btn ui-btn-secondary"
                        >
                            Refresh
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setLanguageFilter("current")}
                            className={cn(
                                "rounded-lg border px-3 py-1.5 text-xs font-extrabold transition",
                                languageFilter === "current"
                                    ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white"
                                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]",
                            )}
                        >
                            Current language
                        </button>

                        <button
                            type="button"
                            onClick={() => setLanguageFilter("all")}
                            className={cn(
                                "rounded-lg border px-3 py-1.5 text-xs font-extrabold transition",
                                languageFilter === "all"
                                    ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white"
                                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]",
                            )}
                        >
                            All languages
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {(["all", "recent", "personal", "module", "assignment", "template"] as ScopeFilter[]).map((item) => {
                            const selected = scope === item;

                            return (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => setScope(item)}
                                    className={cn(
                                        "rounded-lg border px-3 py-1.5 text-xs font-extrabold transition",
                                        selected
                                            ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white"
                                            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]",
                                    )}
                                >
                                    {item[0].toUpperCase() + item.slice(1)}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={onCreateBlankProject}
                            className="ui-btn ui-btn-secondary"
                        >
                            New Local
                        </button>

                        <button
                            type="button"
                            onClick={onSaveAsProject}
                            className="inline-flex items-center justify-center rounded-lg border border-emerald-600/25 bg-emerald-500/10 px-4 py-2 text-sm font-extrabold text-emerald-950 transition hover:bg-emerald-500/15 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white"
                        >
                            Save As
                        </button>

                        {!canCreateProjects ? (
                            <div className="flex items-center text-xs font-bold text-amber-700 dark:text-amber-200">
                                Cloud save required for saved projects
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm font-semibold text-neutral-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65">
                            Loading projects…
                        </div>
                    ) : error ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                            {error}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm font-semibold text-neutral-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65">
                            No saved {languageFilter === "current" ? languageLabel(currentLanguage) : ""} projects found.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filtered.map((project) => {
                                const active = currentProjectId === project.id;

                                return (
                                    <div
                                        key={project.id}
                                        className={cn(
                                            "rounded-2xl border p-4 shadow-sm transition",
                                            active
                                                ? "border-emerald-500/30 bg-emerald-50 dark:border-emerald-300/30 dark:bg-emerald-300/10"
                                                : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-black text-neutral-950 dark:text-white">
                                                    {project.title}
                                                </div>

                                                {project.description ? (
                                                    <div className="mt-1 line-clamp-2 text-xs font-semibold text-neutral-500 dark:text-white/55">
                                                        {project.description}
                                                    </div>
                                                ) : null}

                                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-extrabold text-neutral-500 dark:text-white/45">
                                                    <span>{languageLabel(project.language)}</span>
                                                    <span>•</span>
                                                    <span>{scopeLabel(project.scopeKind)}</span>
                                                    <span>•</span>
                                                    <span>v{project.currentVersion}</span>
                                                </div>

                                                <div className="mt-2 text-[11px] font-semibold text-neutral-500 dark:text-white/45">
                                                    Updated {formatWhen(project.updatedAt)}
                                                </div>
                                            </div>

                                            {active ? (
                                                <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                          Open
                        </span>
                                            ) : null}
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => onSelectProject(project.id)}
                                                className="ui-btn ui-btn-secondary"
                                            >
                                                {active ? "Reload" : "Open"}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onRenameProject(project)}
                                                className="ui-btn ui-btn-secondary"
                                            >
                                                Rename
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onArchiveProject(project.id)}
                                                className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 transition hover:bg-red-100 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200 dark:hover:bg-red-400/15"
                                            >
                                                Archive
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
}