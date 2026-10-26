import "server-only";

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

import {
  settleSucceededTutoringCreditRefund,
  updateTutoringCreditRefundStatus,
} from "@/lib/tutoring/tutoringCreditRefund";

export type TutoringCreditRefundWebhookResult =
  | {
      kind:
        | "refunded"
        | "already_refunded";
      refundId: string;
    }
  | {
      kind:
        "status_updated";
      refundId: string;
      status: string;
    }
  | {
      kind:
        "not_tutoring_credit_refund";
    };

export type TutoringCreditRefundWebhookDeps = {
  retrieveRefund(id: string): Promise<Stripe.Refund>;
  retrievePaymentIntent(id: string): Promise<Pick<Stripe.PaymentIntent, "id" | "livemode" | "currency">>;
  settleSucceeded:
    typeof settleSucceededTutoringCreditRefund;
  updateStatus:
    typeof updateTutoringCreditRefundStatus;
};

function defaultDeps():
  TutoringCreditRefundWebhookDeps {
  return {
    retrieveRefund: (id) => getStripe().refunds.retrieve(id),
    retrievePaymentIntent: (id) => getStripe().paymentIntents.retrieve(id),
    settleSucceeded:
      settleSucceededTutoringCreditRefund,
    updateStatus:
      updateTutoringCreditRefundStatus,
  };
}

function refundFromEvent(
  event: Stripe.Event,
): Stripe.Refund | null {
  if (
    !event.type.startsWith(
      "refund.",
    )
  ) {
    return null;
  }

  const refund =
    event.data.object as
      Stripe.Refund;

  return refund?.object ===
    "refund"
    ? refund
    : null;
}

export function isTutoringCreditRefundEvent(
  event: Stripe.Event,
): boolean {
  const refund =
    refundFromEvent(
      event,
    );

  return Boolean(
    refund &&
      refund.metadata
        ?.refundKind ===
        "tutoring_credit",
  );
}

function requiredMetadata(
  refund: Stripe.Refund,
  key: string,
): string {
  const value =
    refund.metadata
      ?.[key]
      ?.trim();

  if (!value) {
    throw new Error(
      `Tutoring Stripe Refund is missing metadata.${key}.`,
    );
  }

  return value;
}

function positiveWholeMetadata(
  refund: Stripe.Refund,
  key: string,
): number {
  const value =
    Number(
      requiredMetadata(
        refund,
        key,
      ),
    );

  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <= 0
  ) {
    throw new Error(
      `Tutoring Stripe Refund has invalid metadata.${key}.`,
    );
  }

  return value;
}

function expandableId(
  value:
    | string
    | { id: string }
    | null
    | undefined,
): string | null {
  if (
    typeof value ===
      "string"
  ) {
    return value;
  }

  return value?.id ??
    null;
}

export async function reconcileTutoringCreditRefundEvent(
  event: Stripe.Event,
  options: {
    deps?:
      TutoringCreditRefundWebhookDeps;
  } = {},
): Promise<TutoringCreditRefundWebhookResult> {
  const eventRefund = refundFromEvent(event);
  if (eventRefund?.metadata?.refundKind !== "tutoring_credit") {
    return { kind: "not_tutoring_credit_refund" };
  }

  const deps = options.deps ?? defaultDeps();
  // The signed event is only a lookup hint. Provider status may already have
  // changed (succeeded, failed, or canceled) when an older event arrives.
  const refund = await deps.retrieveRefund(eventRefund.id);
  if (
    refund?.id !== eventRefund.id ||
    refund.object !== "refund" ||
    refund.metadata?.refundKind !== "tutoring_credit" ||
    !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(refund.status ?? "")
  ) {
    throw new Error("TUTORING_STRIPE_REFUND_NOT_VERIFIED");
  }

  const refundId =
    requiredMetadata(
      refund,
      "refundId",
    );
  const refundAttemptId =
    requiredMetadata(
      refund,
      "refundAttemptId",
    );
  const purchaseId =
    requiredMetadata(
      refund,
      "purchaseId",
    );
  const userId =
    requiredMetadata(
      refund,
      "userId",
    );
  const minutes =
    positiveWholeMetadata(
      refund,
      "minutes",
    );
  const amountMinor =
    positiveWholeMetadata(
      refund,
      "amountMinor",
    );
  const currency =
    requiredMetadata(
      refund,
      "currency",
    ).toLowerCase();

  if (
    refund.amount !==
      amountMinor ||
    refund.currency
      .toLowerCase() !==
      currency
  ) {
    throw new Error(
      "Tutoring Stripe Refund amount or currency does not match metadata.",
    );
  }

  const paymentIntentId =
    expandableId(
      refund.payment_intent,
    );

  if (!paymentIntentId) {
    throw new Error(
      "Tutoring Stripe Refund is missing PaymentIntent identity.",
    );
  }

  // Stripe Refund does not expose livemode in this API version. Verify
  // environment through the canonical PaymentIntent instead of trusting
  // a made-up Refund field or omitting the test/live boundary check.
  const paymentIntent = await deps.retrievePaymentIntent(paymentIntentId);
  if (
    paymentIntent?.id !== paymentIntentId ||
    paymentIntent.livemode !== event.livemode ||
    paymentIntent.currency.toLowerCase() !== currency
  ) {
    throw new Error("TUTORING_STRIPE_REFUND_PAYMENT_NOT_VERIFIED");
  }

  const occurredAt =
    new Date(
      event.created *
        1000,
    );

  if (
    refund.status ===
      "succeeded"
  ) {
    const settled =
      await deps
        .settleSucceeded({
          refundId,
          stripeRefundId:
            refund.id,
          refundAttemptId,
          purchaseId,
          userId,
          paymentIntentId,
          minutes,
          amountMinor,
          currency,
          occurredAt,
        });

    return {
      kind:
        settled.kind,
      refundId:
        settled.refundId,
    };
  }

  const status:
    | "pending"
    | "requires_action"
    | "failed"
    | "canceled" =
    refund.status ===
      "requires_action"
      ? "requires_action"
      : refund.status ===
          "failed"
        ? "failed"
        : refund.status ===
            "canceled"
          ? "canceled"
          : "pending";

  const updated =
    await deps
      .updateStatus({
        refundId,
        stripeRefundId:
          refund.id,
        refundAttemptId,
        purchaseId,
        userId,
        paymentIntentId,
        minutes,
        amountMinor,
        currency,
        status,
        occurredAt,
        failureReason:
          refund.failure_reason ??
          null,
      });

  return {
    kind:
      "status_updated",
    refundId:
      updated.refundId,
    status:
      updated.status,
  };
}
