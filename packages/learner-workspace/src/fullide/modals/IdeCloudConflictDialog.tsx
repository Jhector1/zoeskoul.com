"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type CloudConflict = {
    projectId: string;
    title: string;
    clientBaseVersion: number | null;
    serverVersion: number;
    serverUpdatedAt: string;
};

type Props = {
    open: boolean;
    conflict: CloudConflict | null;
    busy: boolean;
    onKeepEditing: () => void;
    onSaveCopy: () => void;
    onReloadCloud: () => Promise<boolean>;
};

export default function IdeCloudConflictDialog({open, conflict, busy, onKeepEditing, onSaveCopy, onReloadCloud}: Props) {
    const titleId = useId();
    const descriptionId = useId();
    const closeRef = useRef<HTMLButtonElement | null>(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [reloading, setReloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setConfirmDiscard(false);
        setError(null);
        closeRef.current?.focus();
    }, [open, conflict?.projectId, conflict?.serverVersion]);
    useEffect(() => {
        if (!open) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !busy && !reloading) {
                event.preventDefault();
                onKeepEditing();
            }
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [open, busy, reloading, onKeepEditing]);
    if (!open || !conflict || typeof document === "undefined") return null;

    const locked = busy || reloading;
    const reload = async () => {
        if (locked || !confirmDiscard) return;
        setReloading(true);
        setError(null);
        try {
            const ok = await onReloadCloud();
            if (ok) onKeepEditing();
            else setError("Cloud reload did not complete. Your local workspace remains available.");
        } catch {
            setError("Cloud reload failed. Your local workspace remains available.");
        } finally {
            setReloading(false);
        }
    };
    return createPortal(
        <div className="fixed inset-0 z-[2147483001] flex items-center justify-center bg-neutral-950/50 px-4 py-6" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !locked) onKeepEditing();
        }}>
            <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
                 className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-5 text-neutral-900 shadow-2xl dark:border-white/15 dark:bg-neutral-900 dark:text-white">
                <h2 id={titleId} className="text-base font-semibold">Resolve cloud save conflict</h2>
                <p id={descriptionId} className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                    A newer version of <strong>{conflict.title}</strong> exists in the cloud. Your local changes have not been overwritten.
                </p>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    Local base: v{conflict.clientBaseVersion ?? "unknown"} · Cloud: v{conflict.serverVersion}
                </p>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    Closing this dialog keeps editing enabled, but saving over the newer original remains blocked.
                </p>
                <div className="mt-4 space-y-2 border-t border-neutral-200 pt-4 dark:border-white/10">
                    <button type="button" disabled={locked} onClick={onSaveCopy}
                        className="w-full rounded-md border border-emerald-600/25 bg-emerald-500/10 px-3 py-2 text-left text-sm font-semibold text-emerald-900 hover:bg-emerald-500/15 disabled:opacity-50 dark:text-emerald-100">
                        Save Copy… <span className="block text-xs font-normal">Create a new cloud project. Keep the newer original unchanged.</span>
                    </button>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-neutral-200 px-3 py-2 text-xs text-neutral-700 dark:border-white/15 dark:text-neutral-200">
                        <input type="checkbox" checked={confirmDiscard} onChange={(e) => setConfirmDiscard(e.target.checked)} disabled={locked}
                               className="mt-0.5" />
                        <span>I understand that reloading replaces my current local workspace with the cloud version. I have saved a copy or no longer need these local changes.</span>
                    </label>
                    <button type="button" disabled={locked || !confirmDiscard} onClick={() => void reload()}
                        className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                        {reloading ? "Loading cloud version…" : "Discard local changes and reload cloud"}
                    </button>
                </div>
                {error ? <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
                <div className="mt-4 flex justify-end">
                    <button type="button" ref={closeRef} disabled={locked} onClick={onKeepEditing}
                        className="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-white/10">
                        Keep editing locally
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
