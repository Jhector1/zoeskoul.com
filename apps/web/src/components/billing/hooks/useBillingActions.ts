
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { buildAccessGateSearchParams } from "@zoeskoul/permissions/accessGate";
import {
  clearBrowserCheckoutAttempt,
  getOrCreateBrowserCheckoutAttempt,
  isCheckoutAttemptId,
} from "@/lib/billing/checkoutAttempt";
import type { BillingStatus } from "@/lib/billing/types";
import { startGlobalNavigationPending } from "@/components/navigation/GlobalNavigationProgress";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useBillingActions(args: {
  status: BillingStatus | null;
  callbackUrl: string;
  onError: (msg: string | null) => void;
  accessReason?: "payment_required" | null;
  accessResource?: string | null;
}) {
  const {
    status,
    callbackUrl,
    onError,
    accessReason,
    accessResource,
  } = args;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const actionInFlightRef = useRef(false);

  const authRedirect = useCallback(() => {
    startGlobalNavigationPending({
      label: "Loading…",
      source: "billing-auth-redirect",
    });
    const params = buildAccessGateSearchParams({
      next: callbackUrl || "/",
      reason: accessReason ?? "payment_required",
      resource: accessResource,
    });
    router.push(`/authenticate?${params.toString()}`);
  }, [router, callbackUrl, accessReason, accessResource]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canceled") !== "1") return;

    const checkoutAttemptId = params.get("checkout_attempt_id");
    if (!isCheckoutAttemptId(checkoutAttemptId)) return;

    clearBrowserCheckoutAttempt(checkoutAttemptId);

    void fetch("/api/billing/checkout/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkoutAttemptId }),
    }).catch(() => {
      // Stripe checkout.session.expired and the server-side reservation TTL
      // remain the safety net if this best-effort browser release is lost.
    });
  }, []);

  const startCheckout = useCallback(
    async (plan: "monthly" | "yearly", useTrial = false) => {
      if (!status?.isAuthenticated) {
        authRedirect();
        return;
      }
      if (actionInFlightRef.current) return;

      actionInFlightRef.current = true;
      setBusy(true);
      onError(null);

      let checkoutAttemptId: string | null = null;

      try {
        checkoutAttemptId = getOrCreateBrowserCheckoutAttempt({
          plan,
          useTrial,
          callbackUrl,
        });

        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan,
            useTrial,
            callbackUrl,
            checkoutAttemptId,
          }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          // A 4xx response definitively rejected this attempt before an
          // uncertain Stripe create. A 5xx can occur after Stripe accepted the
          // request, so preserve the attempt for an idempotent retry.
          if (response.status < 500 && checkoutAttemptId) {
            clearBrowserCheckoutAttempt(checkoutAttemptId);
          }
          throw new Error(data?.message ?? "Checkout failed");
        }

        if (!data?.url || typeof data.url !== "string") {
          throw new Error("Checkout failed");
        }

        startGlobalNavigationPending({
          label: "Opening checkout…",
          source: "billing-checkout",
          minVisibleMs: 700,
        });
        window.location.href = data.url;
      } catch (error: unknown) {
        onError(errorMessage(error, "Checkout failed"));
      } finally {
        actionInFlightRef.current = false;
        setBusy(false);
      }
    },
    [
      status?.isAuthenticated,
      callbackUrl,
      authRedirect,
      onError,
    ],
  );

  const openPortal = useCallback(async () => {
    if (!status?.isAuthenticated) {
      authRedirect();
      return;
    }
    if (actionInFlightRef.current) return;

    actionInFlightRef.current = true;
    setBusy(true);
    onError(null);

    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message ?? "Portal failed");
      }
      if (!data?.url || typeof data.url !== "string") {
        throw new Error("Portal failed");
      }

      startGlobalNavigationPending({
        label: "Opening billing portal…",
        source: "billing-portal",
        minVisibleMs: 700,
      });
      window.location.href = data.url;
    } catch (error: unknown) {
      onError(errorMessage(error, "Portal failed"));
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, [status?.isAuthenticated, authRedirect, onError]);

  return { busy, authRedirect, startCheckout, openPortal };
}
