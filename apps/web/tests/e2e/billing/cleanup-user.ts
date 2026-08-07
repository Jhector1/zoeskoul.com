import { loadEnvConfig } from "@next/env";
import Stripe from "stripe";

const USER_EMAIL =
  "playwright.billing.acceptance@zoeskoul.local";

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
      "Refusing billing E2E cleanup outside Stripe test mode.",
    );
  }

  const stripe = new Stripe(secret);
  const { prisma } = await import(
    "../../../src/lib/prisma"
  );

  try {
    const user = await prisma.user.findUnique({
      where: { email: USER_EMAIL },
      select: {
        id: true,
        stripeCustomerId: true,
      },
    });

    if (!user) return;

    const customerId = user.stripeCustomerId;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeCustomerId: null,
        trialUsedAt: null,
        billingCheckoutAttemptId: null,
        billingCheckoutReservedAt: null,
      },
    });

    await prisma.subscription.deleteMany({
      where: { userId: user.id },
    });

    if (customerId) {
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    "Failed to clean the billing acceptance user.",
  );
  console.error(error);
  process.exitCode = 1;
});
