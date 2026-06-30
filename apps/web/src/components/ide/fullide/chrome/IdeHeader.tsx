"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import ProjectSwitcherButton from "@/components/code/projects/ProjectSwitcherButton";
import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";

import { IDE_LANGUAGES } from "../../constants";
import { SQL_DIALECT_LABEL } from "../../constants";
import { cn } from "../../utils";

const IDE_TOOL_BTN =
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-neutral-600 transition-colors " +
    "hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white/90 " +
    "disabled:cursor-not-allowed disabled:opacity-40";

const IDE_TOOL_BTN_ACTIVE =
    "bg-neutral-100 text-neutral-900 dark:bg-white/[0.08] dark:text-white/90";

const IDE_PRIMARY_BTN =
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors " +
    "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 " +
    "dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/[0.08] " +
    "disabled:cursor-not-allowed disabled:opacity-40";

const IDE_SAVE_BTN =
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors " +
    "border-emerald-600/20 bg-emerald-500/10 text-emerald-900 hover:bg-emerald-500/15 " +
    "dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100 dark:hover:bg-emerald-300/15 " +
    "disabled:cursor-not-allowed disabled:opacity-40";

function StatusChip({
                        conflict,
                        dirty,
                        saveBusy,
    lastSavedAt,
}: {
    conflict: boolean;
    dirty: boolean;
    saveBusy: boolean;
    lastSavedAt: string | null;
}) {
    const t = useTranslations("ide.fullIde.status");
    const label = conflict
        ? t("conflict")
        : saveBusy
            ? t("saving")
            : dirty
                ? t("unsaved")
                : lastSavedAt
                    ? t("saved")
                    : t("notSaved");

    const tone = conflict
        ? "text-amber-700 dark:text-amber-200"
        : saveBusy
            ? "text-sky-700 dark:text-sky-200"
            : dirty
                ? "text-orange-700 dark:text-orange-200"
                : "text-emerald-700 dark:text-emerald-200";

    const title = conflict
        ? t("conflict")
        : saveBusy
            ? t("saving")
            : dirty
                ? t("unsavedTitle")
                : lastSavedAt
                    ? t("savedAt", { time: new Date(lastSavedAt).toLocaleString() })
                    : t("notSavedYet");

    return (
        <div
            className={cn(
                "hidden h-8 items-center rounded-md px-2 text-[11px] font-medium sm:inline-flex",
                tone,
            )}
            title={title}
            aria-live="polite"
        >
            {label}
        </div>
    );
}

export default function IdeHeader({
                                      isDesktop,
                                      showTopLanguageButtons,
                                      showBackButton,
                                      showMobileFilesButton,
                                      showProjectSwitcher,
                                      showActivePath,
                                      showStatus,
                                      showSaveControls,
                                      showSaveAs,
                                      showLessonLink,
                                      language,
                                      sqlDialect,
                                      onChangeSqlDialect,
                                      onChangeLanguage,
                                      onBack,
                                      onOpenFiles,
                                      onOpenProjects,
                                      activePath,
                                      projectTitle,
                                      dirty,
                                      conflict,
                                      lastSavedAt,
                                      lessonHref,
                                      lessonLabel,
                                      saveDisabled,
                                      saveBusy,
                                      saveAsDisabled,
                                      canSaveCloud,
                                      hasUser,
                                      onSave,
                                      onSaveAs,
                                  }: {
    isDesktop: boolean;
    showTopLanguageButtons: boolean;
    showBackButton: boolean;
    showMobileFilesButton: boolean;
    showProjectSwitcher: boolean;
    showActivePath: boolean;
    showStatus: boolean;
    showSaveControls: boolean;
    showSaveAs: boolean;
    showLessonLink: boolean;
    language: WorkspaceLanguage;
    sqlDialect: SqlDialect;
    onChangeSqlDialect: (dialect: SqlDialect) => void;
    onChangeLanguage: (language: WorkspaceLanguage) => void;
    onBack: () => void;
    onOpenFiles: () => void;
    onOpenProjects: () => void;
    activePath: string;
    projectTitle: string;
    dirty: boolean;
    conflict: boolean;
    lastSavedAt: string | null;
    lessonHref?: string;
    lessonLabel: string;
    saveDisabled: boolean;
    saveBusy: boolean;
    saveAsDisabled: boolean;
    canSaveCloud: boolean;
    hasUser: boolean;
    onSave: () => void;
    onSaveAs: () => void;
}) {
    const t = useTranslations("ide.fullIde.header");
    const languageScroller = showTopLanguageButtons ? (
        <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max items-center gap-1 pr-1">
                {IDE_LANGUAGES.map((l) => {
                    const active = language === l;

                    return (
                        <button
                            key={l}
                            type="button"
                            onClick={() => onChangeLanguage(l)}
                            className={cn(
                                IDE_TOOL_BTN,
                                active && IDE_TOOL_BTN_ACTIVE,
                            )}
                        >
                            {l}
                        </button>
                    );
                })}

                {language === "sql" ? (
                    <select
                        value={sqlDialect}
                        onChange={(e) => onChangeSqlDialect(e.target.value as SqlDialect)}
                        className="ml-1 h-8 shrink-0 rounded-md border border-neutral-200 bg-white px-2 text-[11px] font-medium text-neutral-700 outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75"
                        aria-label={t("sqlDialect")}
                    >
                        {Object.entries(SQL_DIALECT_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                ) : null}
            </div>
        </div>
    ) : (
        <div className="flex-1" />
    );

    const saveButtonLabel = conflict
        ? t("resolve")
        : saveBusy
            ? t("saving")
            : canSaveCloud
                ? t("save")
                : hasUser
                    ? t("upgrade")
                    : t("logIn");

    return (
        <div className="border-b border-neutral-200 bg-white/92 backdrop-blur dark:border-white/10 dark:bg-neutral-950/92">
            <div className="flex items-center gap-1.5 px-2.5 py-2">
                {showBackButton ? (
                    <button
                        type="button"
                        onClick={onBack}
                        className={IDE_TOOL_BTN}
                        aria-label={t("goBack")}
                        title={t("goBack")}
                    >
                        <span aria-hidden="true" className="text-sm leading-none">←</span>
                        <span className="hidden sm:inline">{t("back")}</span>
                    </button>
                ) : null}

                {!isDesktop && showMobileFilesButton ? (
                    <button
                        type="button"
                        onClick={onOpenFiles}
                        className={IDE_TOOL_BTN}
                    >
                        {t("files")}
                    </button>
                ) : null}

                {showProjectSwitcher ? (
                    <ProjectSwitcherButton
                        title={projectTitle}
                        dirty={dirty || conflict}
                        onClick={onOpenProjects}
                    />
                ) : (
                    <div className="min-w-0 max-w-[240px] truncate px-2.5 text-[11px] font-medium text-neutral-700 dark:text-white/75">
                        {projectTitle}
                    </div>
                )}

                {showActivePath ? (
                    <div className="hidden min-w-0 flex-1 md:block">
                        <div
                            className="truncate text-[11px] font-medium text-neutral-500 dark:text-white/45"
                            title={activePath}
                        >
                            {activePath}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1" />
                )}

                <div className="ml-auto flex items-center gap-1">
                    {showStatus ? (
                        <StatusChip
                            conflict={conflict}
                            dirty={dirty}
                            saveBusy={saveBusy}
                            lastSavedAt={lastSavedAt}
                        />
                    ) : null}

                    {showSaveAs ? (
                        <button
                            type="button"
                            onClick={onSaveAs}
                            disabled={saveAsDisabled}
                            className={IDE_PRIMARY_BTN}
                        >
                            {conflict ? t("saveCopy") : t("saveAs")}
                        </button>
                    ) : null}

                    {showSaveControls ? (
                        <button
                            type="button"
                            onClick={onSave}
                            disabled={saveDisabled}
                            className={cn(
                                IDE_SAVE_BTN,
                                conflict &&
                                    "border-amber-300/30 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100 dark:hover:bg-amber-300/15",
                                !conflict &&
                                    !canSaveCloud &&
                                    "border-amber-300/30 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100 dark:hover:bg-amber-300/15",
                            )}
                        >
                            {saveButtonLabel}
                        </button>
                    ) : null}

                    {showLessonLink && lessonHref ? (
                        <Link
                            href={lessonHref}
                            className={IDE_TOOL_BTN}
                            aria-label={lessonLabel}
                            title={lessonLabel}
                        >
                            <span aria-hidden="true" className="text-sm leading-none">📘</span>
                            <span className="hidden sm:inline">{lessonLabel}</span>
                        </Link>
                    ) : null}
                </div>
            </div>

            {(showTopLanguageButtons || !isDesktop) ? (
                <div className="border-t border-neutral-200 px-2 py-1.5 dark:border-white/10">
                    {languageScroller}
                </div>
            ) : null}
        </div>
    );
}
