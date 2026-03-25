export type BillingStatus = {
    isAuthenticated: boolean;
    isSubscribed: boolean;

    // Stripe details for display
    stripeStatus: string | null; // "trialing" | "active" | "past_due" | ...
    subscriptionId: string | null;
    priceId: string | null;

    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;

    // ✅ NEW: raw pricing data (Stripe minor units) for locale reformatting client-side
    currency: string;               // e.g. "usd"
    monthlyUnitAmountMinor: number; // e.g. 1000
    yearlyUnitAmountMinor: number;  // e.g. 10000

    // Labels (server formatted, but client can override on locale change)
    monthlyPriceLabel: string;
    yearlyPriceLabel: string;
    yearlySavingsLabel?: string | null;

    trialDays: number;
    trialEligible: boolean;
    trialEndsAt: string | null;

    currentPlan?: "monthly" | "yearly" | null;
};