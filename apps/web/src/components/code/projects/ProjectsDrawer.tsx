"use client";

import React, { useMemo, useState } from "react";
import type { ProjectSummary } from "@/lib/projects/projectApiTypes";
import { cn } from "@/components/ide/utils";
import type { CodeLanguage } from "@/lib/practice/types";

type ScopeFilter = "all" | "recent" | "personal" | "module" | "assignment" | "template";
type LanguageFilter = "current" | "all";

function formatWhen(iso: string) {
    return new Date(iso).toLocaleString();
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
            if (languageFilter === "current" && p.language !== currentLanguage) return false;
            if (!q) return true;

            return (
                p.title.toLowerCase().includes(q) ||
                (p.description ?? "").toLowerCase().includes(q) ||
                p.language.toLowerCase().includes(q) ||
                p.scopeKind.toLowerCase().includes(q)
            );
        });

        if (scope === "recent") return base.slice(0, 8);
        if (scope !== "all") base = base.filter((p) => p.scopeKind === scope);

        return base;
    }, [projects, query, scope, languageFilter, currentLanguage]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/30 backdrop-blur-[1px]">
            <button
                type="button"
                aria-label="Close projects panel"
                className="flex-1 cursor-default"
                onClick={() => onOpenChange(false)}
            />

            <aside className="flex h-full w-full max-w-[440px] flex-col border-l border-neutral-200 bg-white/96 shadow-2xl dark:border-white/10 dark:bg-neutral-950/96">
                <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-white/10">
                    <div className="min-w-0">
                        <div className="ui-kicker">Projects</div>
                        <div className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                            {currentProjectTitle}
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-neutral-500 dark:text-white/45">
                            {languageLabel(currentLanguage)}
                        </div>
                    </div>

                    <button type="button" onClick={() => onOpenChange(false)} className="ui-btn-ide-ghost">
                        Close
                    </button>
                </div>

                <div className="space-y-3 border-b border-neutral-200 p-4 dark:border-white/10">
                    <div className="flex gap-2">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search projects…"
                            className="ui-input-ide flex-1"
                        />

                        <button type="button" onClick={onRefresh} className="ui-btn-ide-border">
                            Refresh
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => setLanguageFilter("current")}
                            className={languageFilter === "current" ? "ui-btn-ide-active" : "ui-btn-ide-border"}
                        >
                            Current
                        </button>

                        <button
                            type="button"
                            onClick={() => setLanguageFilter("all")}
                            className={languageFilter === "all" ? "ui-btn-ide-active" : "ui-btn-ide-border"}
                        >
                            All languages
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        {(["all", "recent", "personal", "module", "assignment", "template"] as ScopeFilter[]).map((item) => {
                            const selected = scope === item;

                            return (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => setScope(item)}
                                    className={selected ? "ui-btn-ide-active" : "ui-btn-ide-border"}
                                >
                                    {item[0].toUpperCase() + item.slice(1)}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" onClick={onCreateBlankProject} className="ui-btn-ide-border">
                            New Local
                        </button>

                        <button type="button" onClick={onSaveAsProject} className="ui-btn-ide-success">
                            Save As
                        </button>

                        {!canCreateProjects ? (
                            <div className="text-[11px] font-medium text-amber-700 dark:text-amber-200">
                                Cloud save required
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="ui-surface-muted px-3 py-3 text-[12px] font-medium text-neutral-600 dark:text-white/60">
                            Loading projects…
                        </div>
                    ) : error ? (
                        <div className="rounded-lg border border-rose-300/20 bg-rose-50/70 px-3 py-3 text-[12px] font-medium text-rose-700 dark:border-rose-300/15 dark:bg-rose-950/20 dark:text-rose-200">
                            {error}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="ui-surface-muted px-3 py-3 text-[12px] font-medium text-neutral-600 dark:text-white/60">
                            No saved {languageFilter === "current" ? languageLabel(currentLanguage) : ""} projects found.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filtered.map((project) => {
                                const active = currentProjectId === project.id;

                                return (
                                    <div
                                        key={project.id}
                                        className={cn(
                                            "rounded-xl border p-3 transition-colors",
                                            active
                                                ? "border-neutral-300 bg-neutral-50 dark:border-white/15 dark:bg-white/[0.06]"
                                                : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium text-neutral-950 dark:text-white">
                                                    {project.title}
                                                </div>

                                                {project.description ? (
                                                    <div className="mt-1 line-clamp-2 text-[12px] font-medium text-neutral-500 dark:text-white/50">
                                                        {project.description}
                                                    </div>
                                                ) : null}

                                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-neutral-500 dark:text-white/45">
                                                    <span>{languageLabel(project.language)}</span>
                                                    <span>•</span>
                                                    <span>{scopeLabel(project.scopeKind)}</span>
                                                    <span>•</span>
                                                    <span>v{project.currentVersion}</span>
                                                </div>

                                                <div className="mt-1.5 text-[11px] font-medium text-neutral-500 dark:text-white/40">
                                                    Updated {formatWhen(project.updatedAt)}
                                                </div>
                                            </div>

                                            {active ? (
                                                <span className="ui-pill-neutral">Open</span>
                                            ) : null}
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => onSelectProject(project.id)}
                                                className="ui-btn-ide-border"
                                            >
                                                {active ? "Reload" : "Open"}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onRenameProject(project)}
                                                className="ui-btn-ide-border"
                                            >
                                                Rename
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onArchiveProject(project.id)}
                                                className="ui-btn-ide-danger"
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