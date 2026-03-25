"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
    open: boolean;
    title: string;
    description?: string;
    confirmText: string;
    cancelText: string;
    danger?: boolean;
    onConfirm: () => void;
    onClose: () => void;

    // optional: control panel width without breaking overlay
    panelClassName?: string; // e.g. "max-w-[20rem]" or "max-w-md"
};

export default function ConfirmResetModal({
                                              open,
                                              title,
                                              description,
                                              confirmText,
                                              cancelText,
                                              danger = true,
                                              onConfirm,
                                              onClose,
                                              panelClassName = "max-w-md",
                                          }: Props) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onClose]);

    useEffect(() => {
        if (!open) return;
        const id = window.setTimeout(() => panelRef.current?.focus(), 0);
        return () => window.clearTimeout(id);
    }, [open]);

    if (!open || !mounted) return null;

    const confirmCls = danger
        ? "bg-rose-500/90 hover:bg-rose-500 text-white"
        : "bg-emerald-500/90 hover:bg-emerald-500 text-white";

    const node = (
        <div
            data-modal-root="true"
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            aria-modal="true"
            role="dialog"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Panel */}
            <div
                ref={panelRef}
                tabIndex={-1}
                className={[
                    "relative w-full overflow-visible rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl outline-none",
                    panelClassName,
                ].join(" ")}
            >
                <div className="text-lg font-extrabold leading-tight text-white/90">
                    {title}
                </div>

                {description ? (
                    <div className="mt-2 text-sm leading-6 text-white/70">
                        {description}
                    </div>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-white/80 hover:bg-white/10"
                    >
                        {cancelText}
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        className={["h-10 rounded-xl px-4 text-sm font-extrabold", confirmCls].join(" ")}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(node, document.body);
}