"use client";

import React, { useEffect, useState } from "react";

export default function ProjectNameModal(props: {
    open: boolean;
    busy?: boolean;
    title: string;
    description?: string;
    confirmLabel: string;
    initialValue?: string;
    placeholder?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
}) {
    const {
        open,
        busy = false,
        title,
        description,
        confirmLabel,
        initialValue = "",
        placeholder = "Enter project name",
        onConfirm,
        onCancel,
    } = props;

    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        if (!open) return;
        setValue(initialValue);
    }, [open, initialValue]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 px-4">
            <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-neutral-950">
                <div className="text-base font-black text-neutral-950 dark:text-white">
                    {title}
                </div>

                {description ? (
                    <p className="mt-2 text-sm font-semibold text-neutral-600 dark:text-white/65">
                        {description}
                    </p>
                ) : null}

                <div className="mt-4">
                    <input
                        autoFocus
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                const next = value.trim();
                                if (next) onConfirm(next);
                            }
                            if (e.key === "Escape") {
                                e.preventDefault();
                                onCancel();
                            }
                        }}
                        placeholder={placeholder}
                        className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-emerald-400 dark:border-white/10 dark:bg-black/30 dark:text-white/85"
                    />
                </div>

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
                        disabled={busy || !value.trim()}
                        onClick={() => onConfirm(value.trim())}
                        className="inline-flex items-center justify-center rounded-lg border border-emerald-600/25 bg-emerald-500/10 px-4 py-2 text-sm font-extrabold text-emerald-950 transition hover:bg-emerald-500/15 disabled:opacity-60 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white"
                    >
                        {busy ? "Working…" : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}