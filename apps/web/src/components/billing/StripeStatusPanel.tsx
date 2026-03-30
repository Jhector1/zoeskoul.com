"use client";

import React, { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

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
  if (tone === "good") return "ui-pill-good";
  if (tone === "warn") return "ui-pill-warn";
  if (tone === "bad") return "ui-pill-danger";
  return "ui-pill-neutral";
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

    if (props.trialEnd) {
      out.push({
        k: "trialEnd",
        text: t("trialEnds", { when: formatWhen(props.trialEnd, locale) }),
      });
    }

    if (props.currentPeriodEnd) {
      out.push({
        k: "renews",
        text: t("renews", { when: formatWhen(props.currentPeriodEnd, locale) }),
      });
    }

    if (props.cancelAtPeriodEnd) {
      out.push({ k: "cancel", text: t("cancelAtPeriodEnd"), tone: "warn" });
    }

    return out;
  }, [
    t,
    locale,
    tone,
    statusLabel,
    props.plan,
    planLabel,
    props.trialEnd,
    props.currentPeriodEnd,
    props.cancelAtPeriodEnd,
  ]);

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
            <div className="ui-surface-soft p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="ui-meta-strong">{t("ids.priceId")}</div>
                  <div className="mt-1 break-all text-xs text-neutral-700 dark:text-white/80">
                    {props.priceId ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="ui-meta-strong">{t("ids.subscriptionId")}</div>
                  <div className="mt-1 break-all text-xs text-neutral-700 dark:text-white/80">
                    {props.subscriptionId ?? "—"}
                  </div>
                </div>
              </div>
            </div>
        ) : null}
      </div>
  );
}