import { prisma } from "@/lib/prisma";
import { stripe } from "./_stripe";

async function main() {
    const email = process.argv[2];
    if (!email) throw new Error("Usage: ts-node scripts/resetBilling.ts user@email.com");

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, stripeCustomerId: true },
    });
    if (!user) throw new Error("User not found");

    // Cancel Stripe subscriptions (if customer exists)
    if (user.stripeCustomerId) {
        const subs = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            status: "all",
            limit: 100,
        });

        for (const s of subs.data) {
            // cancel immediately
            await stripe.subscriptions.cancel(s.id);
        }

        // Optional: also delete the customer (not required)
        // await stripe.customers.del(user.stripeCustomerId);
    }

    // Clear DB
    await prisma.subscription.deleteMany({ where: { userId: user.id } });

    await prisma.user.update({
        where: { id: user.id },
        data: {
            stripeCustomerId: null,
            trialUsedAt: null, // optional (resets trial)
        },
    });

    console.log("Reset complete for:", email);
}

main().finally(async () => prisma.$disconnect());