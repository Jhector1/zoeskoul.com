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
          <button
              type="button"
              aria-label="Close dialog"
              className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
              onClick={() => (busy ? null : onOpenChange(false))}
          />

          <div className="relative w-full max-w-lg ui-surface-floating p-4 md:p-5">
            <div className="ui-title-sm">{title}</div>

            {description ? (
                <div className="mt-2 text-sm ui-text-muted">{description}</div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                  type="button"
                  disabled={busy}
                  onClick={() => onOpenChange(false)}
                  className={busy ? "ui-btn-disabled" : "ui-btn-secondary h-9 px-3"}
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
                  className={
                    busy
                        ? "ui-btn-disabled"
                        : danger
                            ? "ui-btn-ide-danger px-3"
                            : "ui-btn-primary"
                  }
              >
                {busy ? "Working…" : confirmLabel}
              </button>
            </div>
          </div>
        </div>
    );
  }, [open, title, description, confirmLabel, cancelLabel, danger, busy, onConfirm, onOpenChange]);

  if (!mounted) return null;
  return createPortal(node, document.body);
}