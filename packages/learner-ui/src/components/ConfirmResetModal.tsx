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
    panelClassName?: string;
};

function cn(...cls: Array<string | false | null | undefined>) {
    return cls.filter(Boolean).join(" ");
}

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

    const node = (
        <div
            data-modal-root="true"
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            aria-modal="true"
            role="dialog"
        >
            <div
                className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                ref={panelRef}
                tabIndex={-1}
                className={cn("relative w-full ui-surface-floating p-5 outline-none", panelClassName)}
            >
                <div className="ui-title-md">{title}</div>

                {description ? (
                    <div className="mt-2 text-sm leading-6 ui-text-muted">{description}</div>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="ui-btn-secondary h-10 px-4 text-sm"
                    >
                        {cancelText}
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        className={cn(
                            danger ? "ui-btn-ide-danger h-10 px-4 text-sm" : "ui-btn-primary h-10 px-4 text-sm",
                        )}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(node, document.body);
}