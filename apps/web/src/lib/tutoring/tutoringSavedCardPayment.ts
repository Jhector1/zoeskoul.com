import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  prepareTutoringCreditPurchase,
  tutoringStripePublishableKey,
  type TutoringCheckoutEnv,
} from "@/lib/tutoring/tutoringCreditCheckout";
import {
  authorizeTutoringSavedPaymentMethodForCharge,
} from "@/lib/tutoring/tutoringSavedPaymentMethod";

type PreparedPurchase =
  Awaited<
    ReturnType<
      typeof prepareTutoringCreditPurchase
    >
  >;

type ChargeAuthorization = {
  customerId: string;
  paymentMethodId: string;
};

export type TutoringSavedCardPaymentResult =
  | {
      kind:
        "saved_card_paid_pending_webhook";
      purchaseId: string;
    }
  | {
      kind:
        "saved_card_processing";
      purchaseId: string;
    }
  | {
      kind:
        "saved_card_requires_action";
      purchaseId: string;
      clientSecret: string;
      publishableKey: string;
    }
  | {
      kind: "already_paid";
      purchaseId: string;
    };

export class TutoringSavedCardPaymentError
  extends Error {
  readonly code:
    | "NO_SAVED_PAYMENT_METHOD"
    | "SAVED_CARD_DECLINED"
    | "INVALID_PAYMENT_STATE";

  constructor(
    code:
      | "NO_SAVED_PAYMENT_METHOD"
      | "SAVED_CARD_DECLINED"
      | "INVALID_PAYMENT_STATE",
    message: string,
  ) {
    super(message);
    this.name =
      "TutoringSavedCardPaymentError";
    this.code = code;
  }
}

export type TutoringSavedCardPaymentDeps = {
  preparePurchase(args: {
    userId: string;
    checkoutAttemptId: string;
    minutes: number;
  }): Promise<PreparedPurchase>;
  authorizeCard(
    userId: string,
  ): Promise<ChargeAuthorization | null>;
  createAndConfirmPaymentIntent(
    params: Stripe.PaymentIntentCreateParams,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentIntent>;
  retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent>;
  persistPaymentIntent(args: {
    purchaseId: string;
    paymentIntentId: string;
  }): Promise<void>;
};

function defaultDeps():
  TutoringSavedCardPaymentDeps {
  return {
    preparePurchase: async (args) =>
      prepareTutoringCreditPurchase(
        args,
      ),
    authorizeCard: async (userId) => {
      const authorized =
        await authorizeTutoringSavedPaymentMethodForCharge(
          userId,
        );

      return authorized
        ? {
            customerId:
              authorized.customerId,
            paymentMethodId:
              authorized.paymentMethodId,
          }
        : null;
    },
    createAndConfirmPaymentIntent:
      async (
        params,
        idempotencyKey,
      ) =>
        getStripe()
          .paymentIntents
          .create(
            params,
            { idempotencyKey },
          ),
    retrievePaymentIntent:
      async (paymentIntentId) =>
        getStripe()
          .paymentIntents
          .retrieve(
            paymentIntentId,
          ),
    persistPaymentIntent:
      async (args) => {
        await prisma
          .tutoringCreditPurchase
          .update({
            where: {
              id: args.purchaseId,
            },
            data: {
              stripePaymentIntentId:
                args.paymentIntentId,
            },
          });
      },
  };
}

function assertIntentMatches(
  intent: Stripe.PaymentIntent,
  prepared: PreparedPurchase,
  customerId: string,
) {
  const {
    purchase,
    quote,
  } = prepared;

  const intentCustomerId =
    typeof intent.customer === "string"
      ? intent.customer
      : intent.customer?.id ??
        null;

  if (
    intentCustomerId !==
      customerId ||
    intent.amount !==
      quote.amountMinor ||
    intent.currency
      .toLowerCase() !==
      quote.currency.toLowerCase() ||
    intent.metadata
      .purchaseKind !==
      "tutoring_credit" ||
    intent.metadata
      .paymentChannel !==
      "saved_card" ||
    intent.metadata
      .purchaseId !==
      purchase.id ||
    intent.metadata
      .userId !==
      purchase.userId ||
    intent.metadata
      .checkoutAttemptId !==
      purchase.checkoutAttemptId ||
    intent.metadata
      .packageMinutes !==
      String(
        purchase.packageMinutes,
      ) ||
    intent.metadata
      .amountMinor !==
      String(
        purchase.amountMinor,
      )
  ) {
    throw new TutoringSavedCardPaymentError(
      "INVALID_PAYMENT_STATE",
      "Stripe saved-card payment does not match the tutoring purchase.",
    );
  }
}

export async function createTutoringSavedCardPayment(
  args: {
    userId: string;
    checkoutAttemptId: string;
    minutes: number;
  },
  options: {
    deps?: TutoringSavedCardPaymentDeps;
    env?: TutoringCheckoutEnv;
  } = {},
): Promise<TutoringSavedCardPaymentResult> {
  const deps =
    options.deps ??
    defaultDeps();

  const prepared =
    await deps.preparePurchase(
      args,
    );

  const {
    purchase,
    quote,
  } = prepared;

  if (
    purchase.status ===
    "paid"
  ) {
    return {
      kind: "already_paid",
      purchaseId:
        purchase.id,
    };
  }

  if (
    purchase.status !==
    "pending"
  ) {
    throw new TutoringSavedCardPaymentError(
      "INVALID_PAYMENT_STATE",
      `Tutoring credit purchase cannot use a saved card from status ${purchase.status}.`,
    );
  }

  if (
    purchase
      .stripeCheckoutSessionId
  ) {
    throw new TutoringSavedCardPaymentError(
      "INVALID_PAYMENT_STATE",
      "This tutoring purchase attempt already belongs to Stripe Checkout.",
    );
  }

  const authorization =
    await deps.authorizeCard(
      args.userId,
    );

  if (!authorization) {
    throw new TutoringSavedCardPaymentError(
      "NO_SAVED_PAYMENT_METHOD",
      "No saved payment method is available.",
    );
  }

  let intent:
    Stripe.PaymentIntent;

  if (
    purchase
      .stripePaymentIntentId
  ) {
    intent =
      await deps
        .retrievePaymentIntent(
          purchase
            .stripePaymentIntentId,
        );
  } else {
    intent =
      await deps
        .createAndConfirmPaymentIntent(
          {
            amount:
              quote.amountMinor,
            currency:
              quote.currency,
            customer:
              authorization
                .customerId,
            payment_method:
              authorization
                .paymentMethodId,
            payment_method_types: [
              "card",
            ],
            confirm: true,
            use_stripe_sdk: true,
            confirmation_method:
              "automatic",
            description:
              `${quote.minutes} minutes of ZoeSkoul human tutoring`,
            metadata: {
              purchaseKind:
                "tutoring_credit",
              paymentChannel:
                "saved_card",
              purchaseId:
                purchase.id,
              userId:
                purchase.userId,
              checkoutAttemptId:
                purchase
                  .checkoutAttemptId,
              packageMinutes:
                String(
                  purchase
                    .packageMinutes,
                ),
              amountMinor:
                String(
                  purchase
                    .amountMinor,
                ),
              currency:
                purchase.currency,
              pricingVersion:
                quote
                  .pricingVersion,
            },
          },
          `zoeskoul-tutoring-saved-card:${purchase.checkoutAttemptId}`,
        );

    await deps
      .persistPaymentIntent({
        purchaseId:
          purchase.id,
        paymentIntentId:
          intent.id,
      });
  }

  assertIntentMatches(
    intent,
    prepared,
    authorization.customerId,
  );

  if (
    intent.status ===
    "succeeded"
  ) {
    return {
      kind:
        "saved_card_paid_pending_webhook",
      purchaseId:
        purchase.id,
    };
  }

  if (
    intent.status ===
    "processing"
  ) {
    return {
      kind:
        "saved_card_processing",
      purchaseId:
        purchase.id,
    };
  }

  if (
    intent.status ===
    "requires_action"
  ) {
    if (
      !intent.client_secret
    ) {
      throw new TutoringSavedCardPaymentError(
        "INVALID_PAYMENT_STATE",
        "Stripe requires authentication but did not return a client secret.",
      );
    }

    return {
      kind:
        "saved_card_requires_action",
      purchaseId:
        purchase.id,
      clientSecret:
        intent.client_secret,
      publishableKey:
        tutoringStripePublishableKey(
          options.env ??
            process.env,
        ),
    };
  }

  if (
    intent.status ===
      "requires_payment_method" ||
    intent.status ===
      "canceled"
  ) {
    throw new TutoringSavedCardPaymentError(
      "SAVED_CARD_DECLINED",
      "The saved payment method could not be charged. Use another payment method or try again.",
    );
  }

  throw new TutoringSavedCardPaymentError(
    "INVALID_PAYMENT_STATE",
    `Stripe returned unsupported saved-card payment status ${intent.status}.`,
  );
}
