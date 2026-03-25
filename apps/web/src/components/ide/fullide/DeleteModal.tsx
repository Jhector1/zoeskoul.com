"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FSNode, NodeId } from "../types";

export default function DeleteModal(props: {
    nodes: FSNode[];
    pendingDeleteId: NodeId;
    onCancel: () => void;
    onDelete: () => void;
}) {
    const n = useMemo(
        () => props.nodes.find((x) => x.id === props.pendingDeleteId),
        [props.nodes, props.pendingDeleteId],
    );

    const [mounted, setMounted] = useState(false);
    const cancelRef = useRef<HTMLButtonElement | null>(null);
    const deleteRef = useRef<HTMLButtonElement | null>(null);
    const lastActiveRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        lastActiveRef.current = document.activeElement as HTMLElement | null;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const focusId = window.setTimeout(() => {
            cancelRef.current?.focus();
        }, 0);

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                props.onCancel();
                return;
            }

            if (e.key === "Tab") {
                const first = cancelRef.current;
                const last = deleteRef.current;
                if (!first || !last) return;

                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                    return;
                }

                if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        window.addEventListener("keydown", onKey);

        return () => {
            window.clearTimeout(focusId);
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
            lastActiveRef.current?.focus?.();
        };
    }, [mounted, props]);

    if (!mounted) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[999] grid place-items-center bg-black/60 p-4"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) props.onCancel();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-modal-title"
                aria-describedby="delete-modal-description"
                className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-[#0b0f14]"
            >
                <div
                    id="delete-modal-title"
                    className="text-sm font-black text-neutral-900 dark:text-white/90"
                >
                    Delete
                </div>

                <div
                    id="delete-modal-description"
                    className="mt-2 text-xs font-semibold text-neutral-600 dark:text-white/70"
                >
                    Delete{" "}
                    <span className="font-extrabold text-neutral-900 dark:text-white/85">
                        {n?.name ?? "this item"}
                    </span>
                    ?
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={props.onCancel}
                        className="ui-quiz-action ui-quiz-action--ghost"
                    >
                        Cancel
                    </button>

                    <button
                        ref={deleteRef}
                        type="button"
                        onClick={props.onDelete}
                        className="rounded-xl border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs font-extrabold text-rose-900 hover:bg-rose-300/15 dark:text-white/90"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}