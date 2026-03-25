"use client";

import Link from "next/link";

import ProjectSwitcherButton from "@/components/code/projects/ProjectSwitcherButton";
import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";

import { ACTION_BTN_CLASS, CHIP_BTN_CLASS, IDE_LANGUAGES } from "../../constants";
import { SQL_DIALECT_LABEL } from "../../constants";
import { cn } from "../../utils";

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
  const label = conflict
      ? "Conflict"
      : saveBusy
          ? "Saving…"
          : dirty
              ? "Unsaved changes"
              : lastSavedAt
                  ? `Saved ${new Date(lastSavedAt).toLocaleString()}`
                  : "Not saved yet";

  const tone = conflict
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100"
      : saveBusy
          ? "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-100"
          : dirty
              ? "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-300/20 dark:bg-orange-300/10 dark:text-orange-100"
              : "border-emerald-600/25 bg-emerald-500/10 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white/90";

  return (
      <div
          className={cn(
              "hidden rounded-lg border px-2.5 py-1 text-[11px] font-extrabold sm:block",
              tone,
          )}
          title={label}
          aria-live="polite"
      >
        {label}
      </div>
  );
}

export default function IdeHeader({
                                    isDesktop,
                                    showTopLanguageButtons,
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
  language: CodeLanguage;
  sqlDialect: SqlDialect;
  onChangeSqlDialect: (dialect: SqlDialect) => void;
  onChangeLanguage: (language: CodeLanguage) => void;
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
  const languageScroller = showTopLanguageButtons ? (
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="flex min-w-max items-center gap-2 pr-1">
          {IDE_LANGUAGES.map((l) => (
              <button
                  key={l}
                  type="button"
                  onClick={() => onChangeLanguage(l)}
                  className={cn(
                      CHIP_BTN_CLASS,
                      language === l
                          ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white/90"
                          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/75 dark:hover:bg-white/[0.10]",
                  )}
              >
                {l}
              </button>
          ))}

          {language === "sql" ? (
              <select
                  value={sqlDialect}
                  onChange={(e) => onChangeSqlDialect(e.target.value as SqlDialect)}
                  className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-extrabold text-neutral-700 outline-none dark:border-white/10 dark:bg-white/[0.06] dark:text-white/75"
                  aria-label="SQL dialect"
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
      ? "Resolve Conflict"
      : saveBusy
          ? "Saving…"
          : canSaveCloud
              ? "Save Project"
              : hasUser
                  ? "Upgrade to Save"
                  : "Log in to Save";

  return (
      <div className="border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-neutral-950/95">
        <div className="flex items-center gap-2 px-3 py-2">
          <button type="button" onClick={onBack} className={ACTION_BTN_CLASS} aria-label="Go back" title="Go back">
            <span aria-hidden="true" className="text-sm leading-none">←</span>
            <span className="ml-1 hidden sm:inline">Back</span>
          </button>

          {!isDesktop ? (
              <button type="button" onClick={onOpenFiles} className={ACTION_BTN_CLASS}>
                Files
              </button>
          ) : null}

          <ProjectSwitcherButton title={projectTitle} dirty={dirty || conflict} onClick={onOpenProjects} />

          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-neutral-500 dark:text-white/50">
              {activePath}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusChip
                conflict={conflict}
                dirty={dirty}
                saveBusy={saveBusy}
                lastSavedAt={lastSavedAt}
            />

            <button
                type="button"
                onClick={onSaveAs}
                disabled={saveAsDisabled}
                className={ACTION_BTN_CLASS}
            >
              {conflict ? "Save As Copy" : "Save As"}
            </button>

            <button
                type="button"
                onClick={onSave}
                disabled={saveDisabled}
                className={cn(
                    CHIP_BTN_CLASS,
                    conflict
                        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100"
                        : canSaveCloud
                            ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white/90"
                            : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100",
                )}
            >
              {saveButtonLabel}
            </button>
          </div>

          {lessonHref ? (
              <Link href={lessonHref} className={ACTION_BTN_CLASS} aria-label={lessonLabel} title={lessonLabel}>
                <span aria-hidden="true" className="text-sm leading-none">📘</span>
                <span className="ml-1 hidden sm:inline">{lessonLabel}</span>
              </Link>
          ) : null}
        </div>

        {(showTopLanguageButtons || !isDesktop) ? (
            <div className="border-t border-neutral-200 px-2 py-2 dark:border-white/10">
              {languageScroller}
            </div>
        ) : null}
      </div>
  );
}