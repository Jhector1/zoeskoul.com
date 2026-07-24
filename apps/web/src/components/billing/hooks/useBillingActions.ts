"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { BillingStatus } from "@/lib/billing/types";
import { startGlobalNavigationPending } from "@/components/navigation/GlobalNavigationProgress";
import { buildAccessGateSearchParams } from "@/lib/access/accessGate";

export function useBillingActions(args: {
    status: BillingStatus | null;
    callbackUrl: string;
    onError: (msg: string | null) => void;
    accessReason?: "payment_required" | null;
    accessResource?: string | null;
}) {
    const { status, callbackUrl, onError, accessReason, accessResource } = args;
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const authRedirect = useCallback(() => {
        startGlobalNavigationPending({ label: "Loading…", source: "billing-auth-redirect" });
        const params = buildAccessGateSearchParams({
            next: callbackUrl || "/",
            reason: accessReason ?? "payment_required",
            resource: accessResource,
        });
        router.push(`/authenticate?${params.toString()}`);
    }, [router, callbackUrl, accessReason, accessResource]);

    const startCheckout = useCallback(
        async (plan: "monthly" | "yearly", useTrial = false) => {
            if (!status?.isAuthenticated) {
                authRedirect();
                return;
            }

            setBusy(true);
            onError(null);

            try {
                const r = await fetch("/api/billing/checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ plan, useTrial, callbackUrl }),
                });

                const data = await r.json();
                if (!r.ok) throw new Error(data?.message ?? "Checkout failed");

                startGlobalNavigationPending({ label: "Opening checkout…", source: "billing-checkout", minVisibleMs: 700 });
                startGlobalNavigationPending({ label: "Opening billing portal…", source: "billing-portal", minVisibleMs: 700 });
            window.location.href = data.url;
            } catch (e: any) {
                onError(e?.message ?? "Checkout failed");
            } finally {
                setBusy(false);
            }
        },
        [status?.isAuthenticated, callbackUrl, authRedirect, onError],
    );

    const openPortal = useCallback(async () => {
        if (!status?.isAuthenticated) {
            authRedirect();
            return;
        }

        setBusy(true);
        onError(null);

        try {
            const r = await fetch("/api/billing/portal", { method: "POST" });
            const data = await r.json();
            if (!r.ok) throw new Error(data?.message ?? "Portal failed");
            window.location.href = data.url;
        } catch (e: any) {
            onError(e?.message ?? "Portal failed");
        } finally {
            setBusy(false);
        }
    }, [status?.isAuthenticated, authRedirect, onError]);

    return { busy, authRedirect, startCheckout, openPortal };
}
