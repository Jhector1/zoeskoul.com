"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import type { BillingStatus } from "@/lib/billing/types";
import { fmtShortDate } from "@/lib/billing/format";
import { formatMoneyMinor, toIntlLocale } from "@/i18n/money";

function hasRawPricing(s: BillingStatus | null) {
    return Boolean(
        s &&
        typeof (s as any).currency === "string" &&
        typeof (s as any).monthlyUnitAmountMinor === "number" &&
        typeof (s as any).yearlyUnitAmountMinor === "number"
    );
}

export function useBillingStatus() {
    const locale = useLocale(); // "en", "fr", ...
    const intlLocale = useMemo(() => toIntlLocale(locale), [locale]);

    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await fetch("/api/billing/status", { cache: "no-store" });
            const data = await r.json();
            if (!r.ok) throw new Error(data?.message ?? "Failed to load billing status");
            setStatus(data as BillingStatus);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load billing status");
            setStatus(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let dead = false;
        (async () => {
            if (dead) return;
            await load();
        })();
        return () => {
            dead = true;
        };
    }, [load]);

    // ✅ Reformat plan labels instantly when locale changes (no refetch)
    const derivedStatus = useMemo(() => {
        if (!status) return null;

        if (!hasRawPricing(status)) return status;

        const currency = (status as any).currency as string;
        const m = (status as any).monthlyUnitAmountMinor as number;
        const y = (status as any).yearlyUnitAmountMinor as number;

        return {
            ...status,
            monthlyPriceLabel: `${formatMoneyMinor(m, currency, intlLocale)} / mo`,
            yearlyPriceLabel: `${formatMoneyMinor(y, currency, intlLocale)} / yr`,
        };
    }, [status, intlLocale]);

    const trialState = useMemo(() => {
        const ends = derivedStatus?.trialEndsAt ? new Date(derivedStatus.trialEndsAt) : null;
        const now = new Date();
        const inTrial = !!ends && ends.getTime() > now.getTime();
        const trialEnded = !!ends && ends.getTime() <= now.getTime();
        return { ends, inTrial, trialEnded };
    }, [derivedStatus?.trialEndsAt]);

    const canUseTrial = Boolean(derivedStatus?.trialEligible) && !trialState.trialEnded;

    const headlineBadge = useMemo(() => {
        if (!derivedStatus) return null;

        if (derivedStatus.stripeStatus === "trialing") {
            return {
                tone: "good" as const,
                text: `🕒 Trialing • ends ${fmtShortDate(derivedStatus.trialEndsAt, intlLocale)}`,
            };
        }

        if (derivedStatus.stripeStatus === "active") {
            return { tone: "good" as const, text: "✅ Active subscription" };
        }

        if (derivedStatus.stripeStatus === "past_due") {
            return { tone: "warn" as const, text: "⚠️ Past due — update payment method" };
        }

        if (derivedStatus.stripeStatus === "unpaid") {
            return { tone: "warn" as const, text: "⚠️ Unpaid — update payment method" };
        }

        if (derivedStatus.stripeStatus === "canceled") {
            return { tone: "neutral" as const, text: "Canceled" };
        }

        return { tone: "neutral" as const, text: "Not subscribed" };
    }, [derivedStatus, intlLocale]);

    return {
        status: derivedStatus,
        loading,
        error,
        setError,
        reload: load,
        trialState,
        canUseTrial,
        headlineBadge,
    };
}