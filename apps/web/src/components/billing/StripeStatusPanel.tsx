"use client";

import React, { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

export type StripeSubscriptionStatus =
    | "trialing"
    | "active"
    | "past_due"
    | "unpaid"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "paused"
    | "none";

export type BillingPlan = "monthly" | "yearly" | "unknown";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const PILL_BASE =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-extrabold";
const PILL_NEUTRAL =
    "border-neutral-200/70 bg-white/70 text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80";
const PILL_GOOD =
    "border-emerald-300/40 bg-emerald-300/15 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100";
const PILL_WARN =
    "border-amber-300/40 bg-amber-300/15 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100";
const PILL_BAD =
    "border-rose-300/40 bg-rose-300/15 text-rose-900 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-100";

function toneForStatus(s: StripeSubscriptionStatus) {
  switch (s) {
    case "active":
    case "trialing":
      return "good";
    case "past_due":
    case "incomplete":
    case "paused":
      return "warn";
    case "unpaid":
    case "canceled":
    case "incomplete_expired":
      return "bad";
    default:
      return "neutral";
  }
}

function pillClass(tone: "good" | "warn" | "bad" | "neutral") {
  if (tone === "good") return cn(PILL_BASE, PILL_GOOD);
  if (tone === "warn") return cn(PILL_BASE, PILL_WARN);
  if (tone === "bad") return cn(PILL_BASE, PILL_BAD);
  return cn(PILL_BASE, PILL_NEUTRAL);
}

function formatWhen(x: string | null | undefined, locale: string) {
  if (!x) return "—";
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return String(x);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function StripeStatusPanel(props: {
  status?: StripeSubscriptionStatus | string | null;
  plan?: BillingPlan | null;

  trialEnd?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;

  priceId?: string | null;
  subscriptionId?: string | null;

  showIds?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("billing.statusPanel");
  const locale = useLocale();

  const s = (props.status ?? "none") as StripeSubscriptionStatus;
  const tone = toneForStatus(s);

  const statusLabel = t(`statuses.${s}`);
  const planLabel =
      props.plan === "monthly"
          ? t("planMonthly")
          : props.plan === "yearly"
              ? t("planYearly")
              : t("planUnknown");

  const pills = useMemo(() => {
    const out: Array<{ k: string; text: string; tone?: "good" | "warn" | "bad" | "neutral" }> = [];

    out.push({ k: "status", text: t("statusPrefix", { label: statusLabel }), tone });

    if (props.plan) out.push({ k: "plan", text: t("planPrefix", { label: planLabel }) });

    if (props.trialEnd) out.push({ k: "trialEnd", text: t("trialEnds", { when: formatWhen(props.trialEnd, locale) }) });

    if (props.currentPeriodEnd) out.push({ k: "renews", text: t("renews", { when: formatWhen(props.currentPeriodEnd, locale) }) });

    if (props.cancelAtPeriodEnd) out.push({ k: "cancel", text: t("cancelAtPeriodEnd"), tone: "warn" });

    return out;
  }, [t, locale, s, tone, statusLabel, props.plan, planLabel, props.trialEnd, props.currentPeriodEnd, props.cancelAtPeriodEnd]);

  const compact = Boolean(props.compact);

  return (
      <div className={cn("grid gap-3", props.className)}>
        <div className={cn("flex flex-wrap gap-2", compact ? "text-[11px]" : "")}>
          {pills.map((p) => (
              <span key={p.k} className={pillClass(p.tone ?? "neutral")}>
            {p.text}
          </span>
          ))}
        </div>

        {props.showIds ? (
            <div
                className={cn(
                    "rounded-2xl border p-4",
                    "border-neutral-200/70 bg-white/70",
                    "dark:border-white/10 dark:bg-white/[0.04]",
                )}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] font-extrabold text-neutral-500 dark:text-white/60">{t("ids.priceId")}</div>
                  <div className="mt-1 text-xs break-all text-neutral-700 dark:text-white/80">{props.priceId ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-extrabold text-neutral-500 dark:text-white/60">{t("ids.subscriptionId")}</div>
                  <div className="mt-1 text-xs break-all text-neutral-700 dark:text-white/80">
                    {props.subscriptionId ?? "—"}
                  </div>
                </div>
              </div>
            </div>
        ) : null}
      </div>
  );
}