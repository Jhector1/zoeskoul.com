"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/components/ide/utils";

const MODAL_BTN =
    "inline-flex h-8 items-center justify-center rounded-md px-2.5 text-[11px] font-medium transition-colors " +
    "disabled:cursor-not-allowed disabled:opacity-40";

const MODAL_BTN_GHOST =
    "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 " +
    "dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white/90";

const MODAL_BTN_PRIMARY =
    "border border-emerald-600/20 bg-emerald-500/10 text-emerald-900 hover:bg-emerald-500/15 " +
    "dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100 dark:hover:bg-emerald-300/15";

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
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]">
            <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white/96 p-4 shadow-xl dark:border-white/10 dark:bg-neutral-950/96">
                <div className="text-sm font-semibold text-neutral-950 dark:text-white">
                    {title}
                </div>

                {description ? (
                    <p className="mt-1.5 text-[12px] font-medium text-neutral-500 dark:text-white/50">
                        {description}
                    </p>
                ) : null}

                <div className="mt-3">
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
                        className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-[12px] font-medium text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-300 dark:border-white/10 dark:bg-black/25 dark:text-white/85 dark:focus:border-white/20"
                    />
                </div>

                <div className="mt-4 flex items-center justify-end gap-1.5">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className={cn(MODAL_BTN, MODAL_BTN_GHOST)}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        disabled={busy || !value.trim()}
                        onClick={() => onConfirm(value.trim())}
                        className={cn(MODAL_BTN, MODAL_BTN_PRIMARY)}
                    >
                        {busy ? "Working…" : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}