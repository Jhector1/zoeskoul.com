"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { StripeStatusPanel } from "@/components/billing/StripeStatusPanel";
import { cn } from "@zoeskoul/learner-ui/lib/cn";

import BillingShell from "@/components/billing/BillingShell";
import BillingHeader from "@/components/billing/BillingHeader";
import BillingError from "@/components/billing/BillingError";
import PlanCard from "@/components/billing/PlanCard";
import BillingPromotionCountdown from "@/components/billing/BillingPromotionCountdown";
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
import { canResumeScheduledSubscription } from "@/lib/billing/period";
import {
    CalendarDays,
    ChartColumn,
    ClipboardCheck,
    Clock3,
    CreditCard,
    InfinityIcon,
    Languages,
    LockKeyhole,
    ShieldCheck,
    ShoppingCart,
} from "lucide-react";

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

    const showPaywall = Boolean(paywall?.reason);
    const accessResource = [paywall?.subject, paywall?.module].filter(Boolean).join(" — ") || null;

    const {
        busy,
        authRedirect,
        openPortal,
        startCheckout,
        isCheckoutResume,
        resumeSubscription,
    } = useBillingActions({
        status,
        callbackUrl,
        onError: setError,
        accessReason: showPaywall ? "payment_required" : null,
        accessResource,
    });
    const backHref = safeInternalPath(paywall?.back);

    const paywallTitle =
        paywall?.reason === "module"
            ? t("paywall.titleModule")
            : paywall?.reason === "assignment"
                ? t("paywall.titleAssignment")
                : t("paywall.titleGeneric");

    const trialDays = status?.trialDays ?? 7;

    const resumePlan =
        status?.isSubscribed &&
        canResumeScheduledSubscription({
            status: status.stripeStatus,
            trialEnd: status.trialEndsAt,
            currentPeriodEnd: status.currentPeriodEnd,
            cancelAtPeriodEnd: status.cancelAtPeriodEnd,
        })
            ? status.currentPlan
            : null;

    const resumeCurrentSubscription = async () => {
        const resumed = await resumeSubscription();
        if (resumed) {
            await reload();
        }
    };

    const monthlyPromotion = status?.isSubscribed ? null : status?.activePromotions?.monthly ?? null;
    const yearlyPromotion = status?.isSubscribed ? null : status?.activePromotions?.yearly ?? null;
    const pendingCheckout = status?.isSubscribed ? null : status?.pendingCheckout ?? null;
    const pendingCheckoutKey = pendingCheckout
        ? `${pendingCheckout.plan}:${pendingCheckout.useTrial ? "trial" : "paid"}`
        : null;
    const [switchingPendingCheckout, setSwitchingPendingCheckout] = React.useState<string | null>(null);
    const showPlanChoices =
        !pendingCheckout ||
        (pendingCheckoutKey !== null && switchingPendingCheckout === pendingCheckoutKey);
    const pendingPlanTitle = pendingCheckout
        ? t(`plans.${pendingCheckout.plan}.title`)
        : "";
    const pendingBillingValue = pendingCheckout
        ? pendingCheckout.plan === "yearly"
            ? t("plans.pendingBillingYearly")
            : t("plans.pendingBillingMonthly")
        : "";
    const pendingBillingNote = pendingCheckout
        ? pendingCheckout.plan === "yearly"
            ? t("plans.pendingBillingYearlyNote")
            : t("plans.pendingBillingMonthlyNote")
        : "";
    const pendingCheckoutType = pendingCheckout
        ? pendingCheckout.useTrial
            ? t("plans.pendingCheckoutTrial", { days: trialDays })
            : t("plans.pendingCheckoutPaid")
        : "";
    const pendingCheckoutDetails = pendingCheckout
        ? [
              {
                  key: "plan",
                  label: t("plans.pendingSelectedPlan"),
                  value: pendingPlanTitle,
                  note: t("plans.pendingSelectedPlanNote"),
                  icon: CalendarDays,
                  iconClassName: "text-emerald-600 dark:text-emerald-300",
                  iconSurfaceClassName:
                      "border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10",
              },
              {
                  key: "billing",
                  label: t("plans.pendingBilling"),
                  value: pendingBillingValue,
                  note: pendingBillingNote,
                  icon: CreditCard,
                  iconClassName: "text-blue-600 dark:text-blue-300",
                  iconSurfaceClassName:
                      "border-blue-200 bg-blue-50 dark:border-blue-400/20 dark:bg-blue-400/10",
              },
              {
                  key: "checkout",
                  label: t("plans.pendingCheckoutType"),
                  value: pendingCheckoutType,
                  note: t("plans.pendingCheckoutTypeNote"),
                  icon: Clock3,
                  iconClassName: "text-amber-600 dark:text-amber-300",
                  iconSurfaceClassName:
                      "border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10",
              },
              {
                  key: "access",
                  label: t("plans.pendingAccess"),
                  value: t("plans.pendingAccessValue"),
                  note: t("plans.pendingAccessNote"),
                  icon: LockKeyhole,
                  iconClassName: "text-violet-600 dark:text-violet-300",
                  iconSurfaceClassName:
                      "border-violet-200 bg-violet-50 dark:border-violet-400/20 dark:bg-violet-400/10",
              },
              {
                  key: "cancel",
                  label: t("plans.pendingCancellation"),
                  value: t("plans.pendingCancellationValue"),
                  note: t("plans.pendingCancellationNote"),
                  icon: ShieldCheck,
                  iconClassName: "text-teal-600 dark:text-teal-300",
                  iconSurfaceClassName:
                      "border-teal-200 bg-teal-50 dark:border-teal-400/20 dark:bg-teal-400/10",
              },
          ]
        : [];
    const isPendingCheckoutIntent = (plan: "monthly" | "yearly", useTrial: boolean) =>
        pendingCheckout?.plan === plan && pendingCheckout.useTrial === useTrial;
    const startSelectedCheckout = async (
        plan: "monthly" | "yearly",
        useTrial: boolean,
    ) => {
        setSwitchingPendingCheckout(null);
        await startCheckout(plan, useTrial);
    };

    if (loading) {
        return <BillingPageSkeleton showPaywall={Boolean(paywall?.reason)} />;
    }

    if (status?.billingExempt) {
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

                        <div className="p-5 pt-0">
                            <BillingSoftPanel className="p-5">
                                <div className="ui-title-sm">{t("includedAccess.title")}</div>
                                <div className="mt-2 text-sm text-neutral-700 dark:text-white/70">
                                    {t("includedAccess.body")}
                                </div>
                                <div className="mt-2 ui-meta">{t("includedAccess.note")}</div>
                            </BillingSoftPanel>
                        </div>
                    </BillingCard>
                </div>
            </BillingShell>
        );
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
                                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">
                                    {t("paywall.assignedCourseIncluded")}
                                </div>
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
                            {pendingCheckout && !showPlanChoices ? (
                                <div className="flex items-start gap-3">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10">
                                        <ShoppingCart className="h-6 w-6 text-emerald-600 dark:text-emerald-300" />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="text-xl font-semibold tracking-tight text-neutral-950 dark:text-white">
                                                {t("plans.pendingCheckoutTitle")}
                                            </div>
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                                                <Clock3 className="h-3.5 w-3.5" />
                                                {t("plans.pendingBadge")}
                                            </span>
                                        </div>

                                        <div className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-white/65">
                                            {pendingCheckout.useTrial
                                                ? t("plans.pendingTrialCheckoutBody", { plan: pendingPlanTitle })
                                                : t("plans.pendingCheckoutBody", { plan: pendingPlanTitle })}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="ui-title-sm">{t("plans.sectionTitle")}</div>
                                    <div className="mt-1 ui-meta">
                                        {status?.trialDays
                                            ? t("plans.trialInfoWithDays", { days: status.trialDays })
                                            : t("plans.trialInfo")}
                                    </div>
                                </>
                            )}

                            {showPlanChoices ? (
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
                            ) : null}
                        </BillingSectionHeader>

                        {!loading && status && (!pendingCheckout || showPlanChoices) ? (
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
                        ) : pendingCheckout && !showPlanChoices ? (
                            <div className="p-5 pt-4">
                                <div className="mb-3 text-sm font-semibold text-neutral-800 dark:text-white/85">
                                    {t("plans.pendingSelectionTitle")}
                                </div>

                                <BillingSoftPanel className="overflow-hidden p-0">
                                    <div className="divide-y divide-neutral-200/70 dark:divide-white/10">
                                        {pendingCheckoutDetails.map((detail) => {
                                            const Icon = detail.icon;
                                            return (
                                                <div
                                                    key={detail.key}
                                                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                                                >
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <div
                                                            className={cn(
                                                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                                                                detail.iconSurfaceClassName,
                                                            )}
                                                        >
                                                            <Icon className={cn("h-4 w-4", detail.iconClassName)} />
                                                        </div>
                                                        <div className="text-sm font-medium text-neutral-700 dark:text-white/70">
                                                            {detail.label}
                                                        </div>
                                                    </div>

                                                    <div className="min-w-0 text-left sm:max-w-[58%] sm:text-right">
                                                        <div
                                                            className={cn(
                                                                "text-sm font-semibold text-neutral-950 dark:text-white",
                                                                detail.key === "plan" &&
                                                                    "text-emerald-700 dark:text-emerald-300",
                                                            )}
                                                        >
                                                            {detail.value}
                                                        </div>
                                                        <div className="mt-0.5 text-xs text-neutral-500 dark:text-white/50">
                                                            {detail.note}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </BillingSoftPanel>

                                <div className="mt-4 rounded-xl border border-neutral-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <button
                                            type="button"
                                            className="ui-btn-primary w-full"
                                            disabled={busy}
                                            onClick={() =>
                                                startSelectedCheckout(
                                                    pendingCheckout.plan,
                                                    pendingCheckout.useTrial,
                                                )
                                            }
                                        >
                                            {t("plans.resumeCheckout")}
                                        </button>
                                        <button
                                            type="button"
                                            className="ui-btn-secondary w-full"
                                            disabled={busy}
                                            onClick={() => setSwitchingPendingCheckout(pendingCheckoutKey)}
                                        >
                                            {t("plans.switchPlan")}
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 flex items-center gap-2 px-1 text-xs font-medium text-neutral-500 dark:text-white/50">
                                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                                    <span>{t("plans.pendingSecureCheckout")}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-3 p-5 md:grid-cols-2">
                                <PlanCard
                                    title={t("plans.monthly.title")}
                                    price={monthlyPromotion?.discountedPriceLabel ?? status.monthlyPriceLabel}
                                    originalPrice={monthlyPromotion ? status.monthlyPriceLabel : undefined}
                                    promotionLabel={monthlyPromotion ? t("promotion.badge", { percent: monthlyPromotion.percentOff }) : undefined}
                                    promotionCountdown={monthlyPromotion ? <BillingPromotionCountdown endsAt={monthlyPromotion.endsAt} onExpire={reload} /> : undefined}
                                    subtitle={t("plans.monthly.subtitle")}
                                    recommended={false}
                                    highlight={status.currentPlan === "monthly"}
                                    priceKicker={t("plans.priceKicker")}
                                    recommendedLabel={t("plans.recommended")}
                                    features={t.raw("plans.monthly.features") as string[]}
                                    ctaLabel={
                                        resumePlan === "monthly"
                                            ? t("plans.resumeSubscription")
                                            : isCheckoutResume("monthly", false) || isPendingCheckoutIntent("monthly", false)
                                                ? t("plans.resumeCheckout")
                                                : status.isSubscribed && status.currentPlan === "monthly"
                                                    ? t("plans.currentPlan")
                                                    : t("plans.monthly.subscribe")
                                    }
                                    ctaDisabled={
                                        busy ||
                                        (status.isSubscribed && resumePlan !== "monthly")
                                    }
                                    onCta={
                                        resumePlan === "monthly"
                                            ? resumeCurrentSubscription
                                            : () => startSelectedCheckout("monthly", false)
                                    }
                                    trialLabel={
                                        isCheckoutResume("monthly", true) || isPendingCheckoutIntent("monthly", true)
                                            ? t("plans.resumeCheckout")
                                            : canUseTrial
                                                ? t("plans.startTrial", { days: trialDays })
                                                : trialState.inTrial
                                                ? t("plans.trialActive")
                                                : t("plans.trialUnavailable")
                                    }
                                    trialDisabled={busy || !canUseTrial || status.isSubscribed}
                                    onTrial={() => startSelectedCheckout("monthly", true)}
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
                                    price={yearlyPromotion?.discountedPriceLabel ?? status.yearlyPriceLabel}
                                    originalPrice={yearlyPromotion ? status.yearlyPriceLabel : undefined}
                                    promotionLabel={yearlyPromotion ? t("promotion.badge", { percent: yearlyPromotion.percentOff }) : undefined}
                                    promotionCountdown={yearlyPromotion ? <BillingPromotionCountdown endsAt={yearlyPromotion.endsAt} onExpire={reload} /> : undefined}
                                    subtitle={t("plans.yearly.subtitle")}
                                    recommended
                                    highlight={status.currentPlan === "yearly"}
                                    savings={yearlyPromotion ? undefined : status.yearlySavingsLabel ?? undefined}
                                    priceKicker={t("plans.priceKicker")}
                                    recommendedLabel={t("plans.recommended")}
                                    features={t.raw("plans.yearly.features") as string[]}
                                    ctaLabel={
                                        resumePlan === "yearly"
                                            ? t("plans.resumeSubscription")
                                            : isCheckoutResume("yearly", false) || isPendingCheckoutIntent("yearly", false)
                                                ? t("plans.resumeCheckout")
                                                : status.isSubscribed && status.currentPlan === "yearly"
                                                    ? t("plans.currentPlan")
                                                    : t("plans.yearly.subscribe")
                                    }
                                    ctaDisabled={
                                        busy ||
                                        (status.isSubscribed && resumePlan !== "yearly")
                                    }
                                    onCta={
                                        resumePlan === "yearly"
                                            ? resumeCurrentSubscription
                                            : () => startSelectedCheckout("yearly", false)
                                    }
                                    trialLabel={
                                        isCheckoutResume("yearly", true) || isPendingCheckoutIntent("yearly", true)
                                            ? t("plans.resumeCheckout")
                                            : canUseTrial
                                                ? t("plans.startTrial", { days: trialDays })
                                                : trialState.inTrial
                                                ? t("plans.trialActive")
                                                : t("plans.trialUnavailable")
                                    }
                                    trialDisabled={busy || !canUseTrial || status.isSubscribed}
                                    onTrial={() => startSelectedCheckout("yearly", true)}
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