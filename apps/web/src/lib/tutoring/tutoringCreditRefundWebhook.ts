import "server-only";

import type Stripe from "stripe";

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
  settleSucceeded:
    typeof settleSucceededTutoringCreditRefund;
  updateStatus:
    typeof updateTutoringCreditRefundStatus;
};

function defaultDeps():
  TutoringCreditRefundWebhookDeps {
  return {
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
  const refund =
    refundFromEvent(
      event,
    );

  if (
    !refund ||
    refund.metadata
      ?.refundKind !==
      "tutoring_credit"
  ) {
    return {
      kind:
        "not_tutoring_credit_refund",
    };
  }

  const deps =
    options.deps ??
    defaultDeps();

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
