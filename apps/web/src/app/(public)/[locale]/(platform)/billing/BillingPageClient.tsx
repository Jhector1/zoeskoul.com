"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { StripeStatusPanel } from "@/components/billing/StripeStatusPanel";
import { cn } from "@/lib/cn";

import { CARD } from "@/components/billing/styles";
import BillingShell from "@/components/billing/BillingShell";
import BillingHeader from "@/components/billing/BillingHeader";
import BillingError from "@/components/billing/BillingError";
import PlanCard from "@/components/billing/PlanCard";

import { useBillingStatus } from "@/components/billing/hooks/useBillingStatus";
import { useBillingActions } from "@/components/billing/hooks/useBillingActions";
import InfoRow from "@/components/billing/InfoRow";
import BillingPageSkeleton from "@/components/billing/BillingPageSkeleton";

type PaywallInfo = {
    reason?: string | null; // "module" | "assignment" | ...
    subject?: string | null;
    module?: string | null;
    next?: string | null;
    back?: string | null;
};

function safeInternalPath(path?: string | null) {
    const raw = String(path ?? "").trim();
    if (!raw) return null;
    if (raw.startsWith("//")) return null;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return null;
    return raw.startsWith("/") ? raw : `/${raw}`;
}

export default function BillingPageClient({
                                              callbackUrl,
                                              paywall,
                                          }: {
    callbackUrl: string;
    paywall?: PaywallInfo;
}) {
    const t = useTranslations("billing");

    const { status, loading, error, setError, reload, trialState, canUseTrial, headlineBadge } =
        useBillingStatus();

    const { busy, authRedirect, openPortal, startCheckout } = useBillingActions({
        status,
        callbackUrl,
        onError: setError,
    });

    const showPaywall = Boolean(paywall?.reason);
    const backHref = safeInternalPath(paywall?.back);

    const paywallTitle =
        paywall?.reason === "module"
            ? t("paywall.titleModule")
            : paywall?.reason === "assignment"
                ? t("paywall.titleAssignment")
                : t("paywall.titleGeneric");

    const trialDays = status?.trialDays ?? 7;
    if (loading) {
        return <BillingPageSkeleton showPaywall={Boolean(paywall?.reason)} />;
    }
    return (
        <BillingShell>
            <div className="relative mx-auto max-w-5xl grid gap-4">
                <div className={CARD}>
                    <BillingHeader
                        busy={busy}
                        loading={loading}
                        status={status}
                        headlineBadge={headlineBadge}
                        onManageBilling={openPortal}
                        onSignIn={authRedirect}
                    />

                    {showPaywall ? (
                        <div className="px-5 pb-5">
                            <div
                                className={cn(
                                    "rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 text-sm",
                                    "dark:border-amber-300/15 dark:bg-amber-300/5",
                                )}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="font-black tracking-tight">{paywallTitle}</div>

                                    {backHref ? (
                                        <Link
                                            href={backHref}
                                            className={cn(
                                                "inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-xs font-extrabold",
                                                "bg-neutral-900 text-white shadow-sm hover:shadow-md active:scale-[0.99]",
                                                "dark:bg-white/10 dark:text-white/90 dark:hover:bg-white/12",
                                                "transition",
                                            )}
                                        >
                                            {t("paywall.goBack")}
                                        </Link>
                                    ) : null}
                                </div>

                                <div className="mt-2 text-xs text-neutral-700 dark:text-white/70">
                                    {t("paywall.body")}
                                    {paywall?.subject || paywall?.module ? (
                                        <span className="ml-1">
                      {paywall.subject ? (
                          <span className="font-mono">
                          {t("paywall.subjectLabel")}: {paywall.subject}
                        </span>
                      ) : null}
                                            {paywall.subject && paywall.module ? <span> • </span> : null}
                                            {paywall.module ? (
                                                <span className="font-mono">
                          {t("paywall.moduleLabel")}: {paywall.module}
                        </span>
                                            ) : null}
                    </span>
                                    ) : null}
                                </div>

                                <div className="mt-2 text-xs text-neutral-600 dark:text-white/60">
                                    {t("paywall.afterCheckout")}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {error ? (
                        <div className="p-5">
                            <BillingError message={error} />
                        </div>
                    ) : null}
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <div className={cn(CARD, "lg:col-span-2")}>
                        <div className="border-b border-neutral-200/70 bg-white/70 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-black/20">
                            <div className="text-sm font-black tracking-tight">{t("plans.sectionTitle")}</div>

                            <div className="mt-1 text-xs text-neutral-500 dark:text-white/60">
                                {status?.trialDays
                                    ? t("plans.trialInfoWithDays", { days: status.trialDays })
                                    : t("plans.trialInfo")}
                            </div>

                            <div className="mt-3 flex items-center gap-2">
                                {(["usd", "htg"] as const).map((cur) => (
                                    <button
                                        key={cur}
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await fetch("/api/billing/currency", {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ currency: cur }),
                                                });
                                                await reload();
                                            } catch {
                                                // optional toast
                                            }
                                        }}
                                        className={cn(
                                            "rounded-xl px-3 py-1.5 text-xs font-extrabold border transition",
                                            status?.currency === cur
                                                ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white/10 dark:border-white/20"
                                                : "bg-white/70 text-neutral-900 border-neutral-200/70 hover:bg-white dark:bg-white/[0.04] dark:text-white/80 dark:border-white/10",
                                        )}
                                        aria-pressed={status?.currency === cur}
                                    >
                                        {cur.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {!loading && status ? (
                            <div className="p-5 pt-4">
                                <StripeStatusPanel
                                    status={status.stripeStatus ?? "none"}
                                    plan={status.currentPlan ?? "unknown"}
                                    trialEnd={status.trialEndsAt}
                                    currentPeriodEnd={status.currentPeriodEnd}
                                    cancelAtPeriodEnd={status.cancelAtPeriodEnd}
                                    priceId={status.priceId}
                                    subscriptionId={status.subscriptionId}
                                    showIds={false}
                                />
                            </div>
                        ) : null}

                        {loading || !status ? (
                            <div className="p-5 text-sm text-neutral-600 dark:text-white/70">
                                {t("plans.loading")}
                            </div>
                        ) : (
                            <div className="p-5 grid gap-3 md:grid-cols-2">
                                <PlanCard
                                    title={t("plans.monthly.title")}
                                    price={status.monthlyPriceLabel}
                                    subtitle={t("plans.monthly.subtitle")}
                                    recommended={false}
                                    highlight={status.currentPlan === "monthly"}
                                    priceKicker={t("plans.priceKicker")}
                                    recommendedLabel={t("plans.recommended")}
                                    features={t.raw("plans.monthly.features") as string[]}
                                    ctaLabel={
                                        status.isSubscribed && status.currentPlan === "monthly"
                                            ? t("plans.currentPlan")
                                            : t("plans.monthly.subscribe")
                                    }
                                    ctaDisabled={busy || status.isSubscribed}
                                    onCta={() => startCheckout("monthly", false)}
                                    trialLabel={
                                        canUseTrial
                                            ? t("plans.startTrial", { days: trialDays })
                                            : trialState.inTrial
                                                ? t("plans.trialActive")
                                                : t("plans.trialUnavailable")
                                    }
                                    trialDisabled={busy || !canUseTrial || status.isSubscribed}
                                    onTrial={() => startCheckout("monthly", true)}
                                    trialNote={
                                        !status.trialEligible
                                            ? t("plans.trialNoteUsed")
                                            : trialState.trialEnded
                                                ? t("plans.trialNoteEnded")
                                                : t("plans.trialNoteDefault")
                                    }
                                />

                                <PlanCard
                                    title={t("plans.yearly.title")}
                                    price={status.yearlyPriceLabel}
                                    subtitle={t("plans.yearly.subtitle")}
                                    recommended
                                    highlight={status.currentPlan === "yearly"}
                                    savings={status.yearlySavingsLabel ?? "—"} // savings label comes from server; localize there if you want
                                    priceKicker={t("plans.priceKicker")}
                                    recommendedLabel={t("plans.recommended")}
                                    features={t.raw("plans.yearly.features") as string[]}
                                    ctaLabel={
                                        status.isSubscribed && status.currentPlan === "yearly"
                                            ? t("plans.currentPlan")
                                            : t("plans.yearly.subscribe")
                                    }
                                    ctaDisabled={busy || status.isSubscribed}
                                    onCta={() => startCheckout("yearly", false)}
                                    trialLabel={
                                        canUseTrial
                                            ? t("plans.startTrial", { days: trialDays })
                                            : trialState.inTrial
                                                ? t("plans.trialActive")
                                                : t("plans.trialUnavailable")
                                    }
                                    trialDisabled={busy || !canUseTrial || status.isSubscribed}
                                    onTrial={() => startCheckout("yearly", true)}
                                    trialNote={
                                        !status.trialEligible
                                            ? t("plans.trialNoteUsed")
                                            : trialState.trialEnded
                                                ? t("plans.trialNoteEnded")
                                                : t("plans.trialNoteDefault")
                                    }
                                />
                            </div>
                        )}
                    </div>

                    <div className={CARD}>
                        <div className="border-b border-neutral-200/70 bg-white/70 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-black/20">
                            <div className="text-sm font-black tracking-tight">{t("sidebar.title")}</div>
                            <div className="mt-1 text-xs text-neutral-500 dark:text-white/60">{t("sidebar.subtitle")}</div>
                        </div>

                        <div className="p-5 grid gap-3 text-sm">
                            <InfoRow title={t("sidebar.items.assignments.title")} desc={t("sidebar.items.assignments.desc")} />
                            <InfoRow title={t("sidebar.items.unlimitedPractice.title")} desc={t("sidebar.items.unlimitedPractice.desc")} />
                            <InfoRow title={t("sidebar.items.progressHistory.title")} desc={t("sidebar.items.progressHistory.desc")} />
                            <InfoRow title={t("sidebar.items.multilanguage.title")} desc={t("sidebar.items.multilanguage.desc")} />

                            <div className="rounded-2xl border border-neutral-200/70 bg-white/70 p-4 text-xs text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:shadow-none">
                                {t("sidebar.tip")}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="text-xs text-neutral-500 dark:text-white/55">
                    {t("footer.disclaimer")}
                </div>
            </div>
        </BillingShell>
    );
}