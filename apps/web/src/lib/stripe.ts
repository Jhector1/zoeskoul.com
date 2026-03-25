// src/lib/stripe.ts
import "server-only";
import Stripe from "stripe";

if (!process.env.LEARNOIR_STRIPE_SECRET_KEY) {
    throw new Error("Missing LEARNOIR_STRIPE_SECRET_KEY");
}

// ✅ Pin version so fields/behavior don't drift when Stripe account defaults change
export const stripe = new Stripe(process.env.LEARNOIR_STRIPE_SECRET_KEY, {
    // apiVersion: "2026-01-28.clover",
});