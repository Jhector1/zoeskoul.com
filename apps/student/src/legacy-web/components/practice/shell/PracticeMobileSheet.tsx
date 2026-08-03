"use client";

import React, { useEffect, useId } from "react";

export default function PracticeMobileSheet({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] xl:hidden" data-testid="practice-mobile-sheet">
      <button
        type="button"
        aria-label={closeLabel}
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 max-h-[min(84dvh,760px)] overflow-hidden rounded-t-[1.4rem] border border-b-0 border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-bg)/0.98)] shadow-2xl"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-[rgb(var(--ui-text-muted)/0.3)]" />
        <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--ui-border)/0.78)] px-4 py-3">
          <h2 id={titleId} className="min-w-0 truncate text-sm font-bold">
            {title}
          </h2>
          <button
            type="button"
            className="ui-btn-secondary min-h-9 shrink-0 px-3 py-1.5 text-xs"
            onClick={onClose}
          >
            {closeLabel}
          </button>
        </div>

        <div className="max-h-[calc(84dvh-4.5rem)] overflow-y-auto overscroll-contain p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </section>
    </div>
  );
}
