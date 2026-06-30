"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ProjectSummary } from "@/lib/projects/projectApiTypes";
import { cn } from "@/components/ide/utils";
import type { WorkspaceLanguage } from "@/lib/practice/types";

type ScopeFilter = "all" | "recent" | "personal" | "module" | "assignment" | "template";
type LanguageFilter = "current" | "all";

function formatWhen(iso: string) {
    return new Date(iso).toLocaleString();
}

function scopeLabel(scopeKind: string, t: ReturnType<typeof useTranslations>) {
    switch (scopeKind) {
        case "module":
            return t("scope.module");
        case "assignment":
            return t("scope.assignment");
        case "template":
            return t("scope.template");
        default:
            return t("scope.personal");
    }
}

function languageLabel(language: string, t: ReturnType<typeof useTranslations>) {
    switch (language) {
        case "javascript":
            return t("language.javascript");
        case "cpp":
            return t("language.cpp");
        case "c":
            return t("language.c");
        case "python":
            return t("language.python");
        case "java":
            return t("language.java");
        case "sql":
            return t("language.sql");
        default:
            return language;
    }
}

export default function ProjectsDrawer(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentProjectId: string | null;
    currentProjectTitle: string;
    currentLanguage: WorkspaceLanguage;
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
    const t = useTranslations("ide.projects");
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
                aria-label={t("drawer.closePanel")}
                className="flex-1 cursor-default"
                onClick={() => onOpenChange(false)}
            />

            <aside className="flex h-full w-full max-w-[440px] flex-col border-l border-neutral-200 bg-white/96 shadow-2xl dark:border-white/10 dark:bg-neutral-950/96">
                <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-white/10">
                    <div className="min-w-0">
                        <div className="ui-kicker">{t("drawer.title")}</div>
                        <div className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                            {currentProjectTitle}
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-neutral-500 dark:text-white/45">
                            {languageLabel(currentLanguage, t)}
                        </div>
                    </div>

                    <button type="button" onClick={() => onOpenChange(false)} className="ui-btn-ide-ghost">
                        {t("drawer.close")}
                    </button>
                </div>

                <div className="space-y-3 border-b border-neutral-200 p-4 dark:border-white/10">
                    <div className="flex gap-2">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t("drawer.searchPlaceholder")}
                            className="ui-input-ide flex-1"
                        />

                        <button type="button" onClick={onRefresh} className="ui-btn-ide-border">
                            {t("drawer.refresh")}
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => setLanguageFilter("current")}
                            className={languageFilter === "current" ? "ui-btn-ide-active" : "ui-btn-ide-border"}
                        >
                            {t("drawer.current")}
                        </button>

                        <button
                            type="button"
                            onClick={() => setLanguageFilter("all")}
                            className={languageFilter === "all" ? "ui-btn-ide-active" : "ui-btn-ide-border"}
                        >
                            {t("drawer.allLanguages")}
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
                                    {t(`drawer.filters.${item}` as any)}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" onClick={onCreateBlankProject} className="ui-btn-premium">
                            {t("drawer.newProject")}
                        </button>

                        <button type="button" onClick={onSaveAsProject} className="ui-btn-ide-success">
                            {t("drawer.saveAs")}
                        </button>

                        {!canCreateProjects ? (
                            <div className="text-[11px] font-medium text-amber-700 dark:text-amber-200">
                                {t("drawer.cloudSaveRequired")}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="ui-surface-muted px-3 py-3 text-[12px] font-medium text-neutral-600 dark:text-white/60">
                            {t("drawer.loading")}
                        </div>
                    ) : error ? (
                        <div className="rounded-lg border border-rose-300/20 bg-rose-50/70 px-3 py-3 text-[12px] font-medium text-rose-700 dark:border-rose-300/15 dark:bg-rose-950/20 dark:text-rose-200">
                            {error}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="ui-surface-muted px-3 py-3 text-[12px] font-medium text-neutral-600 dark:text-white/60">
                            {languageFilter === "current"
                                ? t("drawer.emptyCurrent", {
                                      language: languageLabel(currentLanguage, t),
                                  })
                                : t("drawer.emptyAll")}
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
                                                    <span>{languageLabel(project.language, t)}</span>
                                                    <span>•</span>
                                                    <span>{scopeLabel(project.scopeKind, t)}</span>
                                                    <span>•</span>
                                                    <span>v{project.currentVersion}</span>
                                                </div>

                                                <div className="mt-1.5 text-[11px] font-medium text-neutral-500 dark:text-white/40">
                                                    {t("drawer.updatedAt", {
                                                        time: formatWhen(project.updatedAt),
                                                    })}
                                                </div>
                                            </div>

                                            {active ? (
                                                <span className="ui-pill-neutral">{t("drawer.open")}</span>
                                            ) : null}
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => onSelectProject(project.id)}
                                                className="ui-btn-ide-border"
                                            >
                                                {active ? t("drawer.reload") : t("drawer.open")}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onRenameProject(project)}
                                                className="ui-btn-ide-border"
                                            >
                                                {t("drawer.rename")}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onArchiveProject(project.id)}
                                                className="ui-btn-ide-danger"
                                            >
                                                {t("drawer.archive")}
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
