// src/lib/stripe.ts
import "server-only";
import Stripe from "stripe";

// ✅ Pin version so fields/behavior don't drift when Stripe account defaults change
let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
    const secretKey = process.env.LEARNOIR_STRIPE_SECRET_KEY;

    if (!secretKey) {
        throw new Error("Missing LEARNOIR_STRIPE_SECRET_KEY");
    }

    stripeClient ??= new Stripe(secretKey, {
        // apiVersion: "2026-01-28.clover",
    });

    return stripeClient;
}