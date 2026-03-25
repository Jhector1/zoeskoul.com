"use client";

import React from "react";

export default function SaveBeforeSwitchModal(props: {
    open: boolean;
    busy?: boolean;
    title?: string;
    onSaveAndContinue: () => void;
    onDiscardAndContinue: () => void;
    onCancel: () => void;
}) {
    const {
        open,
        busy = false,
        title = "You have unsaved changes.",
        onSaveAndContinue,
        onDiscardAndContinue,
        onCancel,
    } = props;

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4">
            <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-neutral-950">
                <div className="text-base font-black text-neutral-950 dark:text-white">
                    {title}
                </div>

                <p className="mt-2 text-sm font-semibold text-neutral-600 dark:text-white/65">
                    Save your current project before switching, or discard local changes and continue.
                </p>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="ui-btn ui-btn-secondary"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={onDiscardAndContinue}
                        disabled={busy}
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-extrabold text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200 dark:hover:bg-red-400/15"
                    >
                        Discard & Continue
                    </button>

                    <button
                        type="button"
                        onClick={onSaveAndContinue}
                        disabled={busy}
                        className="inline-flex items-center justify-center rounded-lg border border-emerald-600/25 bg-emerald-500/10 px-4 py-2 text-sm font-extrabold text-emerald-950 transition hover:bg-emerald-500/15 disabled:opacity-60 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white"
                    >
                        {busy ? "Saving…" : "Save & Continue"}
                    </button>
                </div>
            </div>
        </div>
    );
}