import { loadEnvConfig } from "@next/env";
import Stripe from "stripe";

const MARKER =
  "__ZOESKOUL_BILLING_PREFLIGHT__=";

async function main() {
  loadEnvConfig(
    process.cwd(),
    true,
    console,
    true,
  );

  const secret =
    process.env.LEARNOIR_STRIPE_SECRET_KEY ?? "";
  const monthlyPriceId =
    process.env.STRIPE_PRICE_MONTHLY_ID ?? "";
  const yearlyPriceId =
    process.env.STRIPE_PRICE_YEARLY_ID ?? "";
  const databaseUrl =
    process.env.DATABASE_URL ?? "";
  const trialDays =
    Number(process.env.TRIAL_DAYS ?? "7");

  if (!secret.startsWith("sk_test_")) {
    throw new Error(
      "Refusing real billing acceptance outside Stripe sandbox: LEARNOIR_STRIPE_SECRET_KEY must be sk_test_.",
    );
  }
  if (
    !monthlyPriceId ||
    !yearlyPriceId
  ) {
    throw new Error(
      "Both Stripe subscription price IDs are required.",
    );
  }
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required.",
    );
  }
  if (
    !Number.isFinite(trialDays) ||
    trialDays <= 0
  ) {
    throw new Error(
      "TRIAL_DAYS must be greater than zero for trial acceptance.",
    );
  }

  const stripe = new Stripe(secret);
  const [
    monthly,
    yearly,
  ] = await Promise.all([
    stripe.prices.retrieve(
      monthlyPriceId,
    ),
    stripe.prices.retrieve(
      yearlyPriceId,
    ),
  ]);

  for (const [
    name,
    price,
  ] of [
    ["monthly", monthly],
    ["yearly", yearly],
  ] as const) {
    if (price.livemode) {
      throw new Error(
        `${name} price is live-mode; billing acceptance is sandbox-only.`,
      );
    }
    if (!price.active) {
      throw new Error(
        `${name} test price is inactive.`,
      );
    }
    if (!price.recurring) {
      throw new Error(
        `${name} test price is not recurring.`,
      );
    }
  }

  const { prisma } = await import(
    "../../src/lib/prisma"
  );

  try {
    await prisma.$queryRaw`SELECT 1`;
  } finally {
    await prisma.$disconnect();
  }

  process.stdout.write(
    MARKER +
      JSON.stringify({
        monthlyPriceId,
        yearlyPriceId,
        trialDays,
      }) +
      "\n",
  );
}

main().catch((error) => {
  console.error(
    "Billing Stripe acceptance preflight failed.",
  );
  console.error(error);
  process.exitCode = 1;
});
