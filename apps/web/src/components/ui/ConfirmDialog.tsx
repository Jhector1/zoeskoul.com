// src/components/ui/ConfirmDialog.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };

    document.addEventListener("keydown", onKeyDown);

    // prevent background scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange]);

  const node = useMemo(() => {
    if (!open) return null;

    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      >
        {/* backdrop */}
        <button
          type="button"
          aria-label="Close dialog"
          className="absolute inset-0 bg-black/60"
          onClick={() => (busy ? null : onOpenChange(false))}
        />

        {/* panel */}
        <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0d12] shadow-2xl">
          <div className="p-4 md:p-5">
            <div className="text-base font-black text-white/90">{title}</div>
            {description ? (
              <div className="mt-2 text-sm text-white/70">{description}</div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onOpenChange(false)}
                className={[
                  "rounded-xl border px-3 py-2 text-xs font-extrabold transition",
                  busy
                    ? "cursor-not-allowed border-white/10 bg-white/5 text-white/40"
                    : "border-white/10 bg-white/10 text-white/80 hover:bg-white/15",
                ].join(" ")}
              >
                {cancelLabel}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  try {
                    setBusy(true);
                    await onConfirm();
                    onOpenChange(false);
                  } finally {
                    setBusy(false);
                  }
                }}
                className={[
                  "rounded-xl border px-3 py-2 text-xs font-extrabold transition",
                  busy
                    ? "cursor-not-allowed border-white/10 bg-white/5 text-white/40"
                    : danger
                      ? "border-rose-300/30 bg-rose-300/10 text-rose-100/90 hover:bg-rose-300/15"
                      : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100/90 hover:bg-emerald-300/15",
                ].join(" ")}
              >
                {busy ? "Working…" : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    danger,
    busy,
    onConfirm,
    onOpenChange,
  ]);

  if (!mounted) return null;
  return createPortal(node, document.body);
}
