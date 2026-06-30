"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ide/utils";

const MODAL_BTN =
    "inline-flex h-8 items-center justify-center rounded-md px-2.5 text-[11px] font-medium transition-colors " +
    "disabled:cursor-not-allowed disabled:opacity-40";

const MODAL_BTN_GHOST =
    "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 " +
    "dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white/90";

const MODAL_BTN_DANGER =
    "border border-red-200/80 bg-red-50 text-red-700 hover:bg-red-100 " +
    "dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200 dark:hover:bg-red-400/15";

const MODAL_BTN_PRIMARY =
    "border border-emerald-600/20 bg-emerald-500/10 text-emerald-900 hover:bg-emerald-500/15 " +
    "dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100 dark:hover:bg-emerald-300/15";

export default function SaveBeforeSwitchModal(props: {
    open: boolean;
    busy?: boolean;
    title?: string;
    onSaveAndContinue: () => void;
    onDiscardAndContinue: () => void;
    onCancel: () => void;
}) {
    const t = useTranslations("ide.projects.modals");
    const {
        open,
        busy = false,
        title = t("unsavedTitle"),
        onSaveAndContinue,
        onDiscardAndContinue,
        onCancel,
    } = props;

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]">
            <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white/96 p-4 shadow-xl dark:border-white/10 dark:bg-neutral-950/96">
                <div className="text-sm font-semibold text-neutral-950 dark:text-white">
                    {title}
                </div>

                <p className="mt-1.5 text-[12px] font-medium text-neutral-500 dark:text-white/50">
                    {t("unsavedDescription")}
                </p>

                <div className="mt-4 flex items-center justify-end gap-1.5">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className={cn(MODAL_BTN, MODAL_BTN_GHOST)}
                    >
                        {t("cancel")}
                    </button>

                    <button
                        type="button"
                        onClick={onDiscardAndContinue}
                        disabled={busy}
                        className={cn(MODAL_BTN, MODAL_BTN_DANGER)}
                    >
                        {t("discardAndContinue")}
                    </button>

                    <button
                        type="button"
                        onClick={onSaveAndContinue}
                        disabled={busy}
                        className={cn(MODAL_BTN, MODAL_BTN_PRIMARY)}
                    >
                        {busy ? t("saving") : t("saveAndContinue")}
                    </button>
                </div>
            </div>
        </div>
    );
}
