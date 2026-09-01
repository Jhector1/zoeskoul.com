import "server-only";

import type Stripe from "stripe";

import { isCheckoutAttemptId } from "@/lib/billing/checkoutAttempt";
import { ensureStripeCustomer } from "@/lib/billing/stripeService";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  calculateTutoringPrice,
  type TutoringPriceQuote,
} from "@/lib/tutoring/tutoringPricing";

export type PurchaseRecord = {
  id: string;
  userId: string;
  checkoutAttemptId: string;
  packageMinutes: number;
  amountMinor: number;
  currency: string;
  stripePriceId: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  status: string;
};

type CheckoutSessionRecord = {
  id: string;
  status: Stripe.Checkout.Session.Status | null;
  payment_status: Stripe.Checkout.Session.PaymentStatus;
  url: string | null;
  client_secret?: string | null;
  ui_mode?: string | null;
};

export type TutoringCheckoutEnv = Readonly<
  Record<string, string | undefined>
>;

export type TutoringCreditCheckoutDeps = {
  findPurchase(
    checkoutAttemptId: string,
  ): Promise<PurchaseRecord | null>;
  createPurchase(args: {
    userId: string;
    checkoutAttemptId: string;
    quote: TutoringPriceQuote;
  }): Promise<PurchaseRecord>;
  updatePurchaseSession(args: {
    purchaseId: string;
    checkoutSessionId: string;
  }): Promise<void>;
  ensureCustomer(userId: string): Promise<string>;
  createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey: string,
  ): Promise<CheckoutSessionRecord>;
  retrieveCheckoutSession(
    sessionId: string,
  ): Promise<CheckoutSessionRecord>;
};

function defaultDeps(): TutoringCreditCheckoutDeps {
  return {
    findPurchase: async (checkoutAttemptId) =>
      prisma.tutoringCreditPurchase.findUnique({
        where: { checkoutAttemptId },
        select: {
          id: true,
          userId: true,
          checkoutAttemptId: true,
          packageMinutes: true,
          amountMinor: true,
          currency: true,
          stripePriceId: true,
          stripeCheckoutSessionId: true,
          stripePaymentIntentId: true,
          status: true,
        },
      }),
    createPurchase: async (args) =>
      prisma.tutoringCreditPurchase.create({
        data: {
          userId: args.userId,
          checkoutAttemptId: args.checkoutAttemptId,
          packageMinutes: args.quote.minutes,
          amountMinor: args.quote.amountMinor,
          currency: args.quote.currency,
          stripePriceId: null,
          status: "pending",
          meta: {
            pricingVersion:
              args.quote.pricingVersion,
            rateMinorPerMinute:
              args.quote.rateMinorPerMinute,
          },
        },
        select: {
          id: true,
          userId: true,
          checkoutAttemptId: true,
          packageMinutes: true,
          amountMinor: true,
          currency: true,
          stripePriceId: true,
          stripeCheckoutSessionId: true,
          stripePaymentIntentId: true,
          status: true,
        },
      }),
    updatePurchaseSession: async (args) => {
      await prisma.tutoringCreditPurchase.update({
        where: { id: args.purchaseId },
        data: {
          stripeCheckoutSessionId:
            args.checkoutSessionId,
        },
      });
    },
    ensureCustomer: ensureStripeCustomer,
    createCheckoutSession:
      async (params, idempotencyKey) =>
        getStripe().checkout.sessions.create(
          params,
          { idempotencyKey },
        ),
    retrieveCheckoutSession: async (sessionId) =>
      getStripe().checkout.sessions.retrieve(
        sessionId,
      ),
  };
}

function appUrlForEnv(
  env: TutoringCheckoutEnv = process.env,
): string {
  const appUrl = env.AUTH_URL
    ?.trim()
    .replace(/\/+$/, "");
  if (!appUrl) {
    throw new Error("Missing AUTH_URL");
  }
  return appUrl;
}

function safeCallbackPath(
  callbackPath?: string | null,
): string {
  const raw = String(callbackPath ?? "").trim();
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//")
  ) {
    return "/billing";
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    return "/billing";
  }
  return raw;
}

function assertPurchaseMatches(
  purchase: PurchaseRecord,
  args: {
    userId: string;
    checkoutAttemptId: string;
    quote: TutoringPriceQuote;
  },
): void {
  if (
    purchase.userId !== args.userId ||
    purchase.checkoutAttemptId !==
      args.checkoutAttemptId ||
    purchase.packageMinutes !==
      args.quote.minutes ||
    purchase.amountMinor !==
      args.quote.amountMinor ||
    purchase.currency.toLowerCase() !==
      args.quote.currency
  ) {
    throw new Error(
      "Existing tutoring credit purchase does not match this checkout attempt.",
    );
  }
}

function isPrismaUniqueConflict(
  error: unknown,
): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  return (
    "code" in error &&
    String(error.code) === "P2002"
  );
}

async function findOrCreatePurchase(
  deps: TutoringCreditCheckoutDeps,
  args: {
    userId: string;
    checkoutAttemptId: string;
    quote: TutoringPriceQuote;
  },
): Promise<PurchaseRecord> {
  const existing = await deps.findPurchase(
    args.checkoutAttemptId,
  );
  if (existing) {
    assertPurchaseMatches(existing, args);
    return existing;
  }

  try {
    return await deps.createPurchase(args);
  } catch (error) {
    if (!isPrismaUniqueConflict(error)) {
      throw error;
    }

    const raced = await deps.findPurchase(
      args.checkoutAttemptId,
    );
    if (!raced) {
      throw error;
    }

    assertPurchaseMatches(raced, args);
    return raced;
  }
}

export async function prepareTutoringCreditPurchase(
  args: {
    userId: string;
    checkoutAttemptId: string;
    minutes: number;
  },
  options: {
    deps?: TutoringCreditCheckoutDeps;
  } = {},
): Promise<{
  purchase: PurchaseRecord;
  quote: TutoringPriceQuote;
}> {
  if (
    !isCheckoutAttemptId(
      args.checkoutAttemptId,
    )
  ) {
    throw new Error(
      "Invalid tutoring checkout attempt.",
    );
  }

  const deps =
    options.deps ??
    defaultDeps();
  const quote =
    calculateTutoringPrice(
      args.minutes,
    );
  const purchase =
    await findOrCreatePurchase(
      deps,
      {
        userId: args.userId,
        checkoutAttemptId:
          args.checkoutAttemptId,
        quote,
      },
    );

  return {
    purchase,
    quote,
  };
}

function checkoutIdempotencyKey(
  checkoutAttemptId: string,
): string {
  return `zoeskoul-tutoring-credit:${checkoutAttemptId}`;
}

export function tutoringStripePublishableKey(
  env: TutoringCheckoutEnv,
): string {
  const value =
    (
      env.LEARNOIR_STRIPE_PUBLISHABLE_KEY ??
      env.STRIPE_PUBLISHABLE_KEY
    )?.trim() ?? "";

  if (
    !value ||
    !value.startsWith("pk_")
  ) {
    throw new Error(
      "Tutoring Embedded Checkout requires LEARNOIR_STRIPE_PUBLISHABLE_KEY or STRIPE_PUBLISHABLE_KEY.",
    );
  }

  return value;
}

export type TutoringCreditCheckoutResult =
  | {
      kind: "checkout";
      purchaseId: string;
      checkoutSessionId: string;
      url: string;
      resumed: boolean;
    }
  | {
      kind: "embedded_checkout";
      purchaseId: string;
      checkoutSessionId: string;
      clientSecret: string;
      publishableKey: string;
      resumed: boolean;
    }
  | {
      kind: "already_paid";
      purchaseId: string;
      checkoutSessionId: string | null;
    }
  | {
      kind: "expired";
      purchaseId: string;
      checkoutSessionId: string;
    };

export async function createTutoringCreditCheckout(
  args: {
    userId: string;
    checkoutAttemptId: string;
    minutes: number;
    uiMode?: "hosted" | "embedded";
    callbackPath?: string | null;
    appLocale?: string | null;
  },
  options: {
    deps?: TutoringCreditCheckoutDeps;
    env?: TutoringCheckoutEnv;
  } = {},
): Promise<TutoringCreditCheckoutResult> {
  const deps =
    options.deps ??
    defaultDeps();
  const {
    purchase,
    quote,
  } =
    await prepareTutoringCreditPurchase(
      {
        userId: args.userId,
        checkoutAttemptId:
          args.checkoutAttemptId,
        minutes:
          args.minutes,
      },
      { deps },
    );
  const uiMode =
    args.uiMode ??
    "hosted";
  const checkoutEnv:
    TutoringCheckoutEnv =
      options.env ??
      process.env;

  if (purchase.status === "paid") {
    return {
      kind: "already_paid",
      purchaseId: purchase.id,
      checkoutSessionId:
        purchase.stripeCheckoutSessionId,
    };
  }

  if (purchase.status !== "pending") {
    throw new Error(
      `Tutoring credit purchase is not checkoutable from status ${purchase.status}.`,
    );
  }

  if (purchase.stripeCheckoutSessionId) {
    const existingSession =
      await deps.retrieveCheckoutSession(
        purchase.stripeCheckoutSessionId,
      );

    if (
      existingSession.status === "open"
    ) {
      if (
        uiMode === "embedded" &&
        existingSession.client_secret
      ) {
        return {
          kind: "embedded_checkout",
          purchaseId: purchase.id,
          checkoutSessionId:
            existingSession.id,
          clientSecret:
            existingSession.client_secret,
          publishableKey:
            tutoringStripePublishableKey(
              checkoutEnv,
            ),
          resumed: true,
        };
      }

      if (
        uiMode === "hosted" &&
        existingSession.url
      ) {
        return {
          kind: "checkout",
          purchaseId: purchase.id,
          checkoutSessionId:
            existingSession.id,
          url: existingSession.url,
          resumed: true,
        };
      }

      throw new Error(
        "Existing tutoring Checkout cannot be resumed in a different UI mode.",
      );
    }

    if (
      existingSession.status === "complete" &&
      existingSession.payment_status === "paid"
    ) {
      return {
        kind: "already_paid",
        purchaseId: purchase.id,
        checkoutSessionId:
          existingSession.id,
      };
    }

    if (
      existingSession.status === "expired"
    ) {
      return {
        kind: "expired",
        purchaseId: purchase.id,
        checkoutSessionId:
          existingSession.id,
      };
    }

    throw new Error(
      "Existing tutoring Checkout is not resumable and is not proven paid.",
    );
  }

  const appUrl =
    appUrlForEnv(options.env);
  const callbackPath =
    safeCallbackPath(args.callbackPath);
  const successUrl =
    `${appUrl}${callbackPath}` +
    `${callbackPath.includes("?") ? "&" : "?"}` +
    "tutoring_credit=success&session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl =
    `${appUrl}${callbackPath}` +
    `${callbackPath.includes("?") ? "&" : "?"}` +
    "tutoring_credit=canceled";

  const customerId =
    await deps.ensureCustomer(args.userId);

  const checkout =
    await deps.createCheckoutSession(
      {
        mode: "payment",
        customer: customerId,
        saved_payment_method_options: {
          payment_method_save:
            "enabled",
        },
        line_items: [
          {
            price_data: {
              currency: quote.currency,
              unit_amount:
                quote.amountMinor,
              product_data: {
                name:
                  `${quote.minutes} minutes of ZoeSkoul human tutoring`,
                description:
                  "Prepaid human tutoring minutes for ZoeSkoul learning support.",
                metadata: {
                  purchaseKind:
                    "tutoring_credit",
                  pricingVersion:
                    quote.pricingVersion,
                },
              },
            },
            quantity: 1,
          },
        ],
        client_reference_id: args.userId,
        metadata: {
          purchaseKind: "tutoring_credit",
          purchaseId: purchase.id,
          userId: args.userId,
          checkoutAttemptId:
            args.checkoutAttemptId,
          packageMinutes:
            String(quote.minutes),
          amountMinor:
            String(quote.amountMinor),
          currency: quote.currency,
          rateMinorPerMinute:
            String(
              quote.rateMinorPerMinute,
            ),
          pricingVersion:
            quote.pricingVersion,
        },
        payment_intent_data: {
          metadata: {
            purchaseKind:
              "tutoring_credit",
            purchaseId: purchase.id,
            userId: args.userId,
            checkoutAttemptId:
              args.checkoutAttemptId,
            packageMinutes:
              String(quote.minutes),
            amountMinor:
              String(quote.amountMinor),
            pricingVersion:
              quote.pricingVersion,
          },
        },
        ...(uiMode === "embedded"
          ? {
              ui_mode:
                "embedded" as const,
              redirect_on_completion:
                "never" as const,
            }
          : {
              success_url:
                successUrl,
              cancel_url:
                cancelUrl,
            }),
      },
      checkoutIdempotencyKey(
        args.checkoutAttemptId,
      ),
    );

  if (
    uiMode === "embedded"
  ) {
    if (!checkout.client_secret) {
      throw new Error(
        "Stripe tutoring Embedded Checkout did not return a client secret.",
      );
    }

    await deps.updatePurchaseSession({
      purchaseId: purchase.id,
      checkoutSessionId:
        checkout.id,
    });

    return {
      kind: "embedded_checkout",
      purchaseId: purchase.id,
      checkoutSessionId:
        checkout.id,
      clientSecret:
        checkout.client_secret,
      publishableKey:
        tutoringStripePublishableKey(
          checkoutEnv,
        ),
      resumed: false,
    };
  }

  if (!checkout.url) {
    throw new Error(
      "Stripe tutoring Checkout did not return a URL.",
    );
  }

  await deps.updatePurchaseSession({
    purchaseId: purchase.id,
    checkoutSessionId: checkout.id,
  });

  return {
    kind: "checkout",
    purchaseId: purchase.id,
    checkoutSessionId: checkout.id,
    url: checkout.url,
    resumed: false,
  };
}
