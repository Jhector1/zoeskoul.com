"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { StripeStatusPanel } from "@/components/billing/StripeStatusPanel";
import { cn } from "@/lib/cn";

import BillingShell from "@/components/billing/BillingShell";
import BillingHeader from "@/components/billing/BillingHeader";
import BillingError from "@/components/billing/BillingError";
import PlanCard from "@/components/billing/PlanCard";
import InfoRow from "@/components/billing/InfoRow";
import BillingPageSkeleton from "@/components/billing/BillingPageSkeleton";
import {
    BillingCard,
    BillingPanel,
    BillingSectionHeader,
    BillingSoftPanel,
} from "@/components/billing/BillingPrimitives";

import { useBillingStatus } from "@/components/billing/hooks/useBillingStatus";
import { useBillingActions } from "@/components/billing/hooks/useBillingActions";
import {ChartColumn, ClipboardCheck, InfinityIcon, Languages} from "lucide-react";

type PaywallInfo = {
    reason?: string | null;
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
            <div className="relative mx-auto grid max-w-5xl gap-4">
                <BillingCard>
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
                            <div className="ui-surface-warn p-4 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="ui-title-sm">{paywallTitle}</div>

                                    {backHref ? (
                                        <Link href={backHref} className={cn("ui-btn-secondary px-3")}>
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

                                <div className="mt-2 ui-meta">{t("paywall.afterCheckout")}</div>
                            </div>
                        </div>
                    ) : null}

                    {error ? (
                        <div className="p-5">
                            <BillingError message={error} />
                        </div>
                    ) : null}
                </BillingCard>

                <div className="grid gap-4 lg:grid-cols-3">
                    <BillingCard className="lg:col-span-2">
                        <BillingSectionHeader>
                            <div className="ui-title-sm">{t("plans.sectionTitle")}</div>

                            <div className="mt-1 ui-meta">
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
                                            status?.currency === cur ? "ui-btn-ide-active px-3" : "ui-btn-ide-border px-3",
                                        )}
                                        aria-pressed={status?.currency === cur}
                                    >
                                        {cur.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </BillingSectionHeader>

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
                            <div className="p-5 ui-meta-strong">{t("plans.loading")}</div>
                        ) : (
                            <div className="grid gap-3 p-5 md:grid-cols-2">
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
                                    savings={status.yearlySavingsLabel ?? "—"}
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
                    </BillingCard>

                    <BillingCard>
                        <BillingSectionHeader>
                            <div className="ui-title-sm">{t("sidebar.title")}</div>
                            <div className="mt-1 ui-meta">{t("sidebar.subtitle")}</div>
                        </BillingSectionHeader>

                        <div className="grid gap-3 p-5 text-sm">
                            <InfoRow title={t("sidebar.items.assignments.title")}
                                     desc={t("sidebar.items.assignments.desc")}
                                     icon={<ClipboardCheck className="h-5 w-5 text-[rgb(var(--ui-warn)))]" />}

                            />
                            <InfoRow
                                title={t("sidebar.items.unlimitedPractice.title")}
                                desc={t("sidebar.items.unlimitedPractice.desc")}
                                icon={<InfinityIcon className="h-5 w-5 text-[rgb(var(--ui-danger)))]" />}
                            />
                            <InfoRow
                                title={t("sidebar.items.progressHistory.title")}
                                desc={t("sidebar.items.progressHistory.desc")}
                                icon={<ChartColumn className="h-5 w-5 text-[rgb(var(--ui-info)))]" />}

                            />
                            <InfoRow
                                title={t("sidebar.items.multilanguage.title")}
                                desc={t("sidebar.items.multilanguage.desc")}
                                icon={<Languages className="h-5 w-5 text-[rgb(var(--ui-accent)))]" />}

                            />

                            <BillingSoftPanel className="p-4 text-xs text-neutral-600 dark:text-white/70">
                                {t("sidebar.tip")}
                            </BillingSoftPanel>
                        </div>
                    </BillingCard>
                </div>

                <div className="ui-meta">{t("footer.disclaimer")}</div>
            </div>
        </BillingShell>
    );
}