import "server-only";

import type Stripe from "stripe";

import { isCheckoutAttemptId } from "@/lib/billing/checkoutAttempt";
import { getStripe } from "@/lib/stripe";
import {
  markTutoringCreditPurchaseTerminal,
  settlePaidTutoringCreditPurchase,
  type TutoringCreditPurchaseSettlementResult,
} from "@/lib/tutoring/tutoringCommercial";

type CheckoutLineItemEvidence = {
  priceId: string | null;
  quantity: number | null;
};

export type TutoringCreditWebhookResult =
  | {
      kind: "credited" | "already_credited";
      purchaseId: string;
      settlement: TutoringCreditPurchaseSettlementResult;
    }
  | {
      kind: "terminal_updated";
      purchaseId: string;
      status: "failed" | "canceled" | "paid" | "refunded";
    }
  | {
      kind: "pending";
      purchaseId: string;
    }
  | {
      kind: "not_tutoring_credit";
    };

export type TutoringCreditWebhookDeps = {
  listCheckoutLineItems(
    sessionId: string,
  ): Promise<CheckoutLineItemEvidence[]>;
  settlePaid(
    args: Parameters<typeof settlePaidTutoringCreditPurchase>[0],
  ): ReturnType<typeof settlePaidTutoringCreditPurchase>;
  markTerminal(
    args: Parameters<typeof markTutoringCreditPurchaseTerminal>[0],
  ): ReturnType<typeof markTutoringCreditPurchaseTerminal>;
};

function defaultDeps(): TutoringCreditWebhookDeps {
  return {
    listCheckoutLineItems: async (sessionId) => {
      const rows = await getStripe().checkout.sessions.listLineItems(
        sessionId,
        { limit: 10 },
      );

      return rows.data.map((row) => ({
        priceId: row.price?.id ?? null,
        quantity: row.quantity ?? null,
      }));
    },
    settlePaid: settlePaidTutoringCreditPurchase,
    markTerminal: markTutoringCreditPurchaseTerminal,
  };
}

function stripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value.id === "string") return value.id;
  return null;
}

function checkoutSessionFromEvent(
  event: Stripe.Event,
): Stripe.Checkout.Session | null {
  if (!event.type.startsWith("checkout.session.")) return null;
  const object = event.data.object as Stripe.Checkout.Session;
  return object?.object === "checkout.session" ? object : null;
}

function paymentIntentFromEvent(
  event: Stripe.Event,
): Stripe.PaymentIntent | null {
  if (
    !event.type.startsWith(
      "payment_intent.",
    )
  ) {
    return null;
  }

  const object =
    event.data.object as
      Stripe.PaymentIntent;

  return object?.object ===
    "payment_intent"
    ? object
    : null;
}

export function isTutoringCreditPaymentIntentEvent(
  event: Stripe.Event,
): boolean {
  const intent =
    paymentIntentFromEvent(
      event,
    );

  return Boolean(
    intent &&
      intent.metadata
        ?.purchaseKind ===
        "tutoring_credit" &&
      intent.metadata
        ?.paymentChannel ===
        "saved_card",
  );
}

function paymentIntentRequiredMetadata(
  intent: Stripe.PaymentIntent,
  key: string,
): string {
  const value =
    intent.metadata
      ?.[key]
      ?.trim();

  if (!value) {
    throw new Error(
      `Tutoring Stripe PaymentIntent is missing metadata.${key}.`,
    );
  }

  return value;
}

function paymentIntentPositiveWholeMetadata(
  intent: Stripe.PaymentIntent,
  key: string,
): number {
  const raw =
    paymentIntentRequiredMetadata(
      intent,
      key,
    );
  const value =
    Number(raw);

  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <= 0
  ) {
    throw new Error(
      `Tutoring Stripe PaymentIntent has invalid metadata.${key}.`,
    );
  }

  return value;
}

export async function reconcileTutoringCreditPaymentIntentEvent(
  event: Stripe.Event,
  options: {
    deps?: TutoringCreditWebhookDeps;
  } = {},
): Promise<TutoringCreditWebhookResult> {
  const intent =
    paymentIntentFromEvent(
      event,
    );

  if (
    !intent ||
    intent.metadata
      ?.purchaseKind !==
      "tutoring_credit" ||
    intent.metadata
      ?.paymentChannel !==
      "saved_card"
  ) {
    return {
      kind:
        "not_tutoring_credit",
    };
  }

  const deps =
    options.deps ??
    defaultDeps();
  const purchaseId =
    paymentIntentRequiredMetadata(
      intent,
      "purchaseId",
    );
  const userId =
    paymentIntentRequiredMetadata(
      intent,
      "userId",
    );
  const checkoutAttemptId =
    paymentIntentRequiredMetadata(
      intent,
      "checkoutAttemptId",
    );

  if (
    !isCheckoutAttemptId(
      checkoutAttemptId,
    )
  ) {
    throw new Error(
      "Tutoring Stripe PaymentIntent has an invalid checkoutAttemptId.",
    );
  }

  const occurredAt =
    new Date(
      event.created *
        1000,
    );

  if (
    event.type ===
      "payment_intent.payment_failed" ||
    event.type ===
      "payment_intent.canceled"
  ) {
    const terminal =
      await deps.markTerminal({
        purchaseId,
        userId,
        checkoutAttemptId,
        checkoutSessionId:
          null,
        paymentIntentId:
          intent.id,
        paymentChannel:
          "saved_card",
        status:
          event.type ===
            "payment_intent.canceled"
            ? "canceled"
            : "failed",
        occurredAt,
      });

    return {
      kind:
        "terminal_updated",
      purchaseId:
        terminal.purchaseId,
      status:
        terminal.status as
          | "failed"
          | "canceled"
          | "paid"
          | "refunded",
    };
  }

  if (
    event.type !==
      "payment_intent.succeeded"
  ) {
    return {
      kind:
        "not_tutoring_credit",
    };
  }

  if (
    intent.status !==
      "succeeded"
  ) {
    throw new Error(
      "Stripe reported saved-card tutoring payment success without succeeded status.",
    );
  }

  const amountMinor =
    paymentIntentPositiveWholeMetadata(
      intent,
      "amountMinor",
    );
  const packageMinutes =
    paymentIntentPositiveWholeMetadata(
      intent,
      "packageMinutes",
    );

  if (
    intent.amount !==
      amountMinor ||
    intent.amount_received !==
      amountMinor
  ) {
    throw new Error(
      "Saved-card tutoring PaymentIntent amount does not match recorded metadata.",
    );
  }

  const currency =
    intent.currency
      ?.trim()
      .toLowerCase();

  if (!currency) {
    throw new Error(
      "Saved-card tutoring PaymentIntent is missing currency.",
    );
  }

  const settlement =
    await deps.settlePaid({
      purchaseId,
      userId,
      checkoutAttemptId,
      checkoutSessionId:
        null,
      paymentIntentId:
        intent.id,
      packageMinutes,
      amountMinor,
      currency,
      stripePriceId:
        null,
      paymentChannel:
        "saved_card",
      paidAt:
        occurredAt,
    });

  return {
    kind:
      settlement.kind,
    purchaseId:
      settlement.purchaseId,
    settlement,
  };
}

export function isTutoringCreditCheckoutEvent(
  event: Stripe.Event,
): boolean {
  const session = checkoutSessionFromEvent(event);
  return Boolean(
    session &&
      session.mode === "payment" &&
      session.metadata?.purchaseKind === "tutoring_credit",
  );
}

function requiredMetadata(
  session: Stripe.Checkout.Session,
  key: string,
): string {
  const value = session.metadata?.[key]?.trim();
  if (!value) {
    throw new Error(`Tutoring Stripe Checkout is missing metadata.${key}.`);
  }
  return value;
}

function positiveWholeMetadata(
  session: Stripe.Checkout.Session,
  key: string,
): number {
  const raw = requiredMetadata(session, key);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Tutoring Stripe Checkout has invalid metadata.${key}.`);
  }
  return value;
}

function checkoutIdentity(session: Stripe.Checkout.Session) {
  const purchaseId = requiredMetadata(session, "purchaseId");
  const userId = requiredMetadata(session, "userId");
  const checkoutAttemptId = requiredMetadata(
    session,
    "checkoutAttemptId",
  );

  if (!isCheckoutAttemptId(checkoutAttemptId)) {
    throw new Error(
      "Tutoring Stripe Checkout has an invalid checkoutAttemptId.",
    );
  }

  if (session.client_reference_id !== userId) {
    throw new Error(
      "Tutoring Stripe Checkout client reference does not match its user.",
    );
  }

  return {
    purchaseId,
    userId,
    checkoutAttemptId,
  };
}

async function paidEvidence(
  session: Stripe.Checkout.Session,
  deps: TutoringCreditWebhookDeps,
) {
  if (
    !Number.isSafeInteger(session.amount_total) ||
    (session.amount_total ?? 0) <= 0
  ) {
    throw new Error(
      "Paid tutoring Stripe Checkout is missing a positive amount_total.",
    );
  }

  const currency = session.currency?.trim().toLowerCase();
  if (!currency) {
    throw new Error(
      "Paid tutoring Stripe Checkout is missing currency.",
    );
  }

  const paymentIntentId = stripeId(session.payment_intent);
  if (!paymentIntentId) {
    throw new Error(
      "Paid tutoring Stripe Checkout is missing its PaymentIntent.",
    );
  }

  const lineItems = await deps.listCheckoutLineItems(session.id);
  if (lineItems.length !== 1) {
    throw new Error(
      "Tutoring Stripe Checkout must contain exactly one line item.",
    );
  }

  const [lineItem] = lineItems;
  if (!lineItem.priceId || lineItem.quantity !== 1) {
    throw new Error(
      "Tutoring Stripe Checkout line item identity is invalid.",
    );
  }

  return {
    paymentIntentId,
    amountMinor: session.amount_total as number,
    currency,
    stripePriceId: lineItem.priceId,
    packageMinutes: positiveWholeMetadata(
      session,
      "packageMinutes",
    ),
  };
}

export async function reconcileTutoringCreditCheckoutEvent(
  event: Stripe.Event,
  options: { deps?: TutoringCreditWebhookDeps } = {},
): Promise<TutoringCreditWebhookResult> {
  const session = checkoutSessionFromEvent(event);
  if (
    !session ||
    session.mode !== "payment" ||
    session.metadata?.purchaseKind !== "tutoring_credit"
  ) {
    return { kind: "not_tutoring_credit" };
  }

  const deps = options.deps ?? defaultDeps();
  const identity = checkoutIdentity(session);
  const occurredAt = new Date(event.created * 1000);

  if (event.type === "checkout.session.async_payment_failed") {
    const terminal = await deps.markTerminal({
      ...identity,
      checkoutSessionId: session.id,
      status: "failed",
      occurredAt,
    });

    return {
      kind: "terminal_updated",
      purchaseId: terminal.purchaseId,
      status: terminal.status as
        | "failed"
        | "canceled"
        | "paid"
        | "refunded",
    };
  }

  if (event.type === "checkout.session.expired") {
    const terminal = await deps.markTerminal({
      ...identity,
      checkoutSessionId: session.id,
      status: "canceled",
      occurredAt,
    });

    return {
      kind: "terminal_updated",
      purchaseId: terminal.purchaseId,
      status: terminal.status as
        | "failed"
        | "canceled"
        | "paid"
        | "refunded",
    };
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return { kind: "not_tutoring_credit" };
  }

  if (session.payment_status !== "paid") {
    if (event.type === "checkout.session.completed") {
      return {
        kind: "pending",
        purchaseId: identity.purchaseId,
      };
    }
    throw new Error(
      "Stripe reported tutoring async payment success without paid status.",
    );
  }

  const evidence = await paidEvidence(session, deps);
  const settlement = await deps.settlePaid({
    ...identity,
    checkoutSessionId: session.id,
    paymentIntentId: evidence.paymentIntentId,
    packageMinutes: evidence.packageMinutes,
    amountMinor: evidence.amountMinor,
    currency: evidence.currency,
    stripePriceId: evidence.stripePriceId,
    paidAt: occurredAt,
  });

  return {
    kind: settlement.kind,
    purchaseId: settlement.purchaseId,
    settlement,
  };
}
