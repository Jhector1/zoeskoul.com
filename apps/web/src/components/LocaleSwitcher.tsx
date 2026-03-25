"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import ConfirmResetModal from "./practice/ConfirmResetModal";
import {persistLocale} from "@/lib/locale/persistLocale";



function Spinner({ className }: { className?: string }) {
  return (
      <span
          aria-hidden="true"
          className={cn(
              "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent",
              className
          )}
      />
  );
}

export default function LocaleSwitcher({
                                         compact = false,
                                         className,
                                       }: {
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const sp = useSearchParams();

  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<string | null>(null);
  const [changingTo, setChangingTo] = useState<string | null>(null);

  const search = sp.toString();
  const href = search ? `${pathname}?${search}` : pathname;

  const description = useMemo(() => {
    if (!pendingLocale) return "";
    return t("confirm.description", {
      from: String(locale).toUpperCase(),
      to: String(pendingLocale).toUpperCase(),
    });
  }, [pendingLocale, locale, t]);

  const requestChangeTo = (nextLocale: string) => {
    if (isPending) return;
    if (nextLocale === locale) return;
    setPendingLocale(nextLocale);
    setConfirmOpen(true);
  };

  const cancel = () => {
    if (isPending) return;
    setConfirmOpen(false);
    setPendingLocale(null);
  };

  const confirm = () => {
    if (isPending) return;
    if (!pendingLocale) return cancel();

    const nextLocale = pendingLocale;

    setChangingTo(nextLocale);
    persistLocale(nextLocale);
    setConfirmOpen(false);

    startTransition(() => {
      router.replace(href, { locale: nextLocale });
    });
  };

  return (
      <div className={cn("relative max-w-full", className)}>
        {confirmOpen ? (
            <ConfirmResetModal
                open={confirmOpen}
                title={t("confirm.title")}
                description={description}
                confirmText={t("confirm.confirmText")}
                cancelText={t("confirm.cancelText")}
                danger={false}
                onConfirm={confirm}
                onClose={cancel}
                panelClassName="max-w-[20rem]"
            />
        ) : null}

        <div className="relative max-w-full">
          {isPending ? (
              <div
                  className={cn(
                      "absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-full",
                      "bg-white/88 text-neutral-900 shadow-sm dark:bg-neutral-950/88 dark:text-white"
                  )}
                  aria-live="polite"
                  aria-busy="true"
              >
                <Spinner />
                <span className="text-xs font-semibold">
{changingTo ? t("changingTo", { locale: changingTo.toUpperCase() }) : t("changing")}            </span>
              </div>
          ) : null}

          <div
              className={cn(
                  "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-neutral-200 bg-white shadow-sm",
                  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                  compact ? "p-1" : "p-1.5",
                  "dark:border-white/10 dark:bg-neutral-900 dark:shadow-none",
                  isPending && "pointer-events-none"
              )}
              aria-label={t("ariaLabel")}
              aria-busy={isPending}
          >
            {routing.locales.map((l) => {
              const active = l === locale;
              const loadingThis = isPending && changingTo === l;

              return (
                  <button
                      key={l}
                      type="button"
                      disabled={isPending}
                      onClick={() => requestChangeTo(l)}
                      className={cn(
                          "inline-flex shrink-0 items-center justify-center gap-1 rounded-full font-semibold leading-none transition",
                          "focus:outline-none focus:ring-2 focus:ring-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-70",
                          compact ? "h-8 min-w-[2.75rem] px-2 text-[11px]" : "h-9 min-w-[3rem] px-3 text-xs",
                          active
                              ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                              : "text-neutral-700 hover:bg-neutral-100 dark:text-white/80 dark:hover:bg-white/10"
                      )}
                      aria-pressed={active}
                      aria-label={t("switchTo", { locale: l.toUpperCase() })}
                  >
                    {loadingThis ? <Spinner className="h-3.5 w-3.5" /> : null}
                    <span>{l.toUpperCase()}</span>
                  </button>
              );
            })}
          </div>
        </div>
      </div>
  );
}