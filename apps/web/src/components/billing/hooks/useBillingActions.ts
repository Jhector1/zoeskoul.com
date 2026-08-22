
"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { buildAccessGateSearchParams } from "@zoeskoul/permissions/accessGate";
import {
  clearBrowserCheckoutAttempt,
  getOrCreateBrowserCheckoutAttempt,
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
  const [checkoutResumeTarget, setCheckoutResumeTarget] = useState<{
    plan: "monthly" | "yearly";
    useTrial: boolean;
  } | null>(null);
  const actionInFlightRef = useRef(false);

  const isCheckoutResume = useCallback(
    (plan: "monthly" | "yearly", useTrial = false) =>
      checkoutResumeTarget?.plan === plan &&
      checkoutResumeTarget.useTrial === useTrial,
    [checkoutResumeTarget],
  );

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

  // A hosted Checkout cancel/back return intentionally preserves the
  // browser attempt and durable reservation. The Billing status endpoint
  // projects the still-open Stripe Session as Resume/Switch. True expiration
  // is cleaned by checkout.session.expired; successful completion is owned by
  // subscription reconciliation.

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
        for (let checkoutSubmission = 0; checkoutSubmission < 2; checkoutSubmission += 1) {
          checkoutAttemptId = getOrCreateBrowserCheckoutAttempt({ plan, useTrial, callbackUrl });

          const response = await fetch("/api/billing/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan, useTrial, callbackUrl, checkoutAttemptId }),
          });
          const data = await response.json().catch(() => null);

          if (!response.ok) {
            if (
              data?.code === "CHECKOUT_ATTEMPT_EXPIRED" &&
              data?.retryable === true &&
              checkoutSubmission === 0
            ) {
              if (checkoutAttemptId) clearBrowserCheckoutAttempt(checkoutAttemptId);
              checkoutAttemptId = null;
              continue;
            }

            if (data?.code === "CHECKOUT_ALREADY_IN_PROGRESS") {
              if (checkoutAttemptId) clearBrowserCheckoutAttempt(checkoutAttemptId);
              setCheckoutResumeTarget({ plan, useTrial });
              onError(null);
              return;
            }

            setCheckoutResumeTarget(null);
            // Preserve 5xx attempts because Stripe outcome can be uncertain.
            if (response.status < 500 && checkoutAttemptId) {
              clearBrowserCheckoutAttempt(checkoutAttemptId);
            }
            throw new Error(data?.message ?? "Checkout failed");
          }

          if (!data?.url || typeof data.url !== "string") throw new Error("Checkout failed");
          setCheckoutResumeTarget(null);
          if (data?.resumed === true && checkoutAttemptId) {
            clearBrowserCheckoutAttempt(checkoutAttemptId);
          }
          startGlobalNavigationPending({
            label: "Opening checkout…",
            source: "billing-checkout",
            minVisibleMs: 700,
          });
          window.location.href = data.url;
          return;
        }
        throw new Error("Checkout failed");
      } catch (error: unknown) {
        onError(errorMessage(error, "Checkout failed"));
      } finally {
        actionInFlightRef.current = false;
        setBusy(false);
      }
    },
    [status?.isAuthenticated, callbackUrl, authRedirect, onError],
  );

  const resumeSubscription = useCallback(async () => {
    if (!status?.isAuthenticated) {
      authRedirect();
      return false;
    }
    if (actionInFlightRef.current) return false;

    actionInFlightRef.current = true;
    setBusy(true);
    onError(null);

    try {
      const response = await fetch(
        "/api/billing/subscription/resume",
        { method: "POST" },
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message ?? "Could not resume subscription.",
        );
      }

      return true;
    } catch (error: unknown) {
      onError(
        errorMessage(
          error,
          "Could not resume subscription.",
        ),
      );
      return false;
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, [
    status?.isAuthenticated,
    authRedirect,
    onError,
  ]);

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

  return {
    busy,
    authRedirect,
    startCheckout,
    isCheckoutResume,
    resumeSubscription,
    openPortal,
  };
}
