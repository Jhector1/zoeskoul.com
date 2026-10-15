"use client";

import type { ReactNode } from "react";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
    />
  );
}

export type LocaleSwitcherChromeProps = {
  compact?: boolean;
  className?: string;
  locales: readonly string[];
  locale: string;
  isPending: boolean;
  changingTo: string | null;
  ariaLabel: string;
  changingLabel: string;
  switchToLabel: (locale: string) => string;
  onRequestChange: (locale: string) => void;
  confirmDialog?: ReactNode;
};

export function LocaleSwitcherChrome({
  compact = false,
  className,
  locales,
  locale,
  isPending,
  changingTo,
  ariaLabel,
  changingLabel,
  switchToLabel,
  onRequestChange,
  confirmDialog,
}: LocaleSwitcherChromeProps) {
  return (
    <div className={cn("relative max-w-full", className)}>
      {confirmDialog}

      <div className="relative max-w-full">
        {isPending ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-md bg-white/92 text-neutral-900 dark:bg-neutral-950/92 dark:text-white"
            aria-live="polite"
            aria-busy="true"
          >
            <Spinner />
            <span className="text-[11px] font-medium">{changingLabel}</span>
          </div>
        ) : null}

        <div
          className={cn(
            "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-md border border-neutral-200 bg-white p-1 shadow-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/10 dark:bg-neutral-900 dark:shadow-none",
            isPending && "pointer-events-none",
          )}
          aria-label={ariaLabel}
          aria-busy={isPending}
        >
          {locales.map((l) => {
            const active = l === locale;
            const loadingThis = isPending && changingTo === l;

            return (
              <button
                key={l}
                type="button"
                disabled={isPending}
                onClick={() => onRequestChange(l)}
                className={cn(
                  active ? "ui-btn-ide-active" : "ui-btn-ide-ghost",
                  compact
                    ? "min-w-[2.5rem] px-2"
                    : "min-w-[2.75rem] px-2.5",
                  "shrink-0 gap-1",
                )}
                aria-pressed={active}
                aria-label={switchToLabel(l)}
              >
                {loadingThis ? <Spinner /> : null}
                <span>{l.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
