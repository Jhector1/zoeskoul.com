"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import { cx } from "../utils/cx";
import { useToolDoc } from "../hooks/useToolDoc";

export default function NotesToolPane(props: {
    noteKey: {
        subjectSlug: string;
        moduleId: string;
        locale: string;
        toolId: string;   // "notes"
        scopeKey: string; // "general" | "exercise:<id>"
    };
    format?: "markdown" | "plain";
}) {
    const t = useTranslations("ide.tools.notes");
    const format = props.format ?? "markdown";
    const { body, setBody, state, flush } = useToolDoc(props.noteKey, { format, debounceMs: 450 });

    const statusText = useMemo(() => {
        if (state === "loading") return t("loading");
        if (state === "saving") return t("saving");
        if (state === "saved") return t("saved");
        if (state === "error") return t("saveFailed");
        return t("autosaveEnabled");
    }, [state, t]);

    return (
        <div className="h-full flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <div className="text-[11px] font-extrabold text-neutral-600 dark:text-white/60">
                    {statusText}
                </div>

                {state === "error" ? (
                    <button
                        type="button"
                        onClick={flush}
                        className="text-[11px] font-extrabold underline underline-offset-2 text-neutral-700 dark:text-white/70"
                    >
                        {t("retry")}
                    </button>
                ) : null}
            </div>

            <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={flush}
                placeholder={t("placeholder")}
                className={cx(
                    "flex-1 min-h-0 w-full rounded-xl border px-3 py-2",
                    "border-neutral-200 bg-white text-sm text-neutral-900",
                    "focus:outline-none focus:ring-2 focus:ring-neutral-300",
                    "dark:border-white/10 dark:bg-black/30 dark:text-white/90 dark:focus:ring-white/20"
                )}
            />
        </div>
    );
}
