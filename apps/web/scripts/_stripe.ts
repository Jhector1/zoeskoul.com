// scripts/_stripe.ts
import Stripe from "stripe";

const key = process.env.LEARNOIR_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Missing LEARNOIR_STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY)");

export const stripe = new Stripe(key, { apiVersion: "2026-01-28.clover" });