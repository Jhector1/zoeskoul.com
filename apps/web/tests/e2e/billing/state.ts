import fs from "node:fs";
import {
  execFileSync,
} from "node:child_process";

import Stripe from "stripe";

import { prisma } from "../../../src/lib/prisma";

export type BillingE2EUser = {
  id: string;
  email: string;
  name: string | null;
};

const secret =
  process.env.LEARNOIR_STRIPE_SECRET_KEY ?? "";
if (!secret.startsWith("sk_test_")) {
  throw new Error(
    "Billing acceptance is sandbox-only.",
  );
}

export const stripe = new Stripe(secret);

export function readBillingE2EUser(): BillingE2EUser {
  const path = process.env.E2E_BILLING_USER_STATE;
  if (!path) {
    throw new Error(
      "E2E_BILLING_USER_STATE is missing.",
    );
  }

  return JSON.parse(
    fs.readFileSync(path, "utf8"),
  ) as BillingE2EUser;
}

export async function billingUserRow() {
  const user = readBillingE2EUser();

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      stripeCustomerId: true,
      trialUsedAt: true,
      billingCheckoutAttemptId: true,
      billingCheckoutReservedAt: true,
    },
  });

  if (!row) {
    throw new Error(
      "Billing E2E user disappeared.",
    );
  }
  return row;
}

async function deleteStripeCustomer(
  customerId: string,
) {
  try {
    await stripe.customers.del(customerId);
  } catch (error: unknown) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error
        ? String(
            (error as { code?: unknown }).code ?? "",
          )
        : "";
    if (code !== "resource_missing") {
      throw error;
    }
  }
}

export async function resetBillingUser(
  options: {
    keepTrialUsedAt?: boolean;
  } = {},
) {
  const user = readBillingE2EUser();
  const current = await billingUserRow();
  const customerId = current.stripeCustomerId;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: null,
      billingCheckoutAttemptId: null,
      billingCheckoutReservedAt: null,
      ...(options.keepTrialUsedAt
        ? {}
        : { trialUsedAt: null }),
    },
  });

  await prisma.subscription.deleteMany({
    where: { userId: user.id },
  });

  if (customerId) {
    await deleteStripeCustomer(customerId);
  }
}

export async function preserveTrialButRemoveSubscription() {
  const before = await billingUserRow();
  if (!before.trialUsedAt) {
    throw new Error(
      "Expected trialUsedAt before second-trial isolation.",
    );
  }

  await resetBillingUser({
    keepTrialUsedAt: true,
  });

  const after = await billingUserRow();
  if (!after.trialUsedAt) {
    throw new Error(
      "Trial-used marker was unexpectedly cleared.",
    );
  }
}

export async function checkoutSessionsForAttempt(
  checkoutAttemptId: string,
) {
  const user = await billingUserRow();
  if (!user.stripeCustomerId) return [];

  const sessions =
    await stripe.checkout.sessions.list({
      customer: user.stripeCustomerId,
      limit: 100,
    });

  return sessions.data.filter(
    (session) =>
      session.metadata?.checkoutAttemptId ===
      checkoutAttemptId,
  );
}

export async function createRealStripeSubscriptionForAttempt(
  args: {
    checkoutAttemptId: string;
    useTrial: boolean;
  },
) {
  const user = readBillingE2EUser();
  const current = await billingUserRow();
  const customerId = current.stripeCustomerId;
  const priceId =
    process.env.STRIPE_PRICE_MONTHLY_ID ?? "";
  const trialDays =
    Number(process.env.TRIAL_DAYS ?? "7");

  if (!customerId) {
    throw new Error(
      "Expected the app Checkout request to create a Stripe customer first.",
    );
  }
  if (!priceId) {
    throw new Error(
      "STRIPE_PRICE_MONTHLY_ID is required.",
    );
  }
  if (
    args.useTrial &&
    (
      !Number.isFinite(trialDays) ||
      trialDays <= 0
    )
  ) {
    throw new Error(
      "TRIAL_DAYS must be positive for trial acceptance.",
    );
  }

  // Stripe documents pm_card_visa specifically for automated test code.
  // Attach it to the isolated sandbox customer so a paid subscription can
  // settle without driving the CAPTCHA-protected hosted Checkout UI.
  const attachedPaymentMethod =
    await stripe.paymentMethods.attach(
      "pm_card_visa",
      {
        customer: customerId,
      },
    );

  await stripe.customers.update(
    customerId,
    {
      invoice_settings: {
        default_payment_method:
          attachedPaymentMethod.id,
      },
    },
  );

  return stripe.subscriptions.create({
    customer: customerId,
    items: [
      {
        price: priceId,
      },
    ],
    default_payment_method:
      attachedPaymentMethod.id,
    ...(args.useTrial
      ? {
          trial_period_days:
            Math.trunc(trialDays),
        }
      : {}),
    metadata: {
      userId: user.id,
      priceId,
      checkoutAttemptId:
        args.checkoutAttemptId,
      billingAcceptance:
        "real-stripe-api",
    },
  });
}

export async function touchRealStripeSubscription(
  subscriptionId: string,
) {
  const subscription =
    await stripe.subscriptions.retrieve(
      subscriptionId,
    );

  return stripe.subscriptions.update(
    subscriptionId,
    {
      metadata: {
        ...subscription.metadata,
        billingAcceptanceReplay:
          String(Date.now()),
      },
    },
  );
}

export async function cancelRealStripeSubscription(
  subscriptionId: string,
) {
  return stripe.subscriptions.cancel(
    subscriptionId,
  );
}

export async function subscriptionRows() {
  const user = readBillingE2EUser();
  return prisma.subscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
}

export async function stripeEventRowsSince(
  type: string,
  since: Date,
) {
  return prisma.stripeEvent.findMany({
    where: {
      type,
      receivedAt: {
        gte: since,
      },
    },
    orderBy: {
      receivedAt: "desc",
    },
  });
}

export function stripeCli(
  args: string[],
) {
  return execFileSync(
    "stripe",
    args,
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 90_000,
    },
  );
}

export function expireCheckoutViaCli(
  sessionId: string,
) {
  stripeCli([
    "checkout",
    "sessions",
    "expire",
    sessionId,
  ]);
}

export function triggerStripeEventViaCli(
  type: string,
) {
  stripeCli([
    "trigger",
    type,
  ]);
}


export async function checkoutSessionDetails(sessionId: string) {
  return stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
}
