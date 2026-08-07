import { loadEnvConfig } from "@next/env";
import Stripe from "stripe";

const USER_EMAIL =
  "playwright.billing.acceptance@zoeskoul.local";
const USER_NAME =
  "Playwright Billing Acceptance";
const USER_MARKER =
  "__ZOESKOUL_BILLING_E2E_USER__=";

async function main() {
  loadEnvConfig(
    process.cwd(),
    true,
    console,
    true,
  );

  const secret =
    process.env.LEARNOIR_STRIPE_SECRET_KEY ?? "";
  if (!secret.startsWith("sk_test_")) {
    throw new Error(
      "Refusing billing E2E seed outside Stripe test mode.",
    );
  }

  const stripe = new Stripe(secret);
  const { prisma } = await import(
    "../../../src/lib/prisma"
  );

  try {
    const existing = await prisma.user.findUnique({
      where: { email: USER_EMAIL },
      select: {
        id: true,
        stripeCustomerId: true,
      },
    });

    if (existing?.stripeCustomerId) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          stripeCustomerId: null,
          billingCheckoutAttemptId: null,
          billingCheckoutReservedAt: null,
        },
      });

      try {
        await stripe.customers.del(
          existing.stripeCustomerId,
        );
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

    if (existing) {
      await prisma.subscription.deleteMany({
        where: { userId: existing.id },
      });
    }

    const user = await prisma.user.upsert({
      where: {
        email: USER_EMAIL,
      },
      update: {
        name: USER_NAME,
        emailVerified: new Date(),
        roles: {
          set: ["student"],
        },
        trialUsedAt: null,
        stripeCustomerId: null,
        billingCheckoutAttemptId: null,
        billingCheckoutReservedAt: null,
      },
      create: {
        email: USER_EMAIL,
        name: USER_NAME,
        emailVerified: new Date(),
        roles: ["student"],
        trialUsedAt: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    process.stdout.write(
      USER_MARKER +
        JSON.stringify(user) +
        "\n",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    "Failed to seed the billing acceptance user.",
  );
  console.error(error);
  process.exitCode = 1;
});
