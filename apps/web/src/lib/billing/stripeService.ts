// src/lib/billing/stripeService.ts
import "server-only";
import {prisma} from "@/lib/prisma";
import {stripe} from "@/lib/stripe";
import type Stripe from "stripe";
import type {StripeSubscriptionStatus} from "@prisma/client";
import { formatMoneyMinor } from "@/i18n/money";

function priceUnitAmountMinor(p: Stripe.Price): number | null {
    if (typeof p.unit_amount === "number") return p.unit_amount;
    if (typeof p.unit_amount_decimal === "string") {
        const n = Number(p.unit_amount_decimal);
        return Number.isFinite(n) ? Math.round(n) : null;
    }
    return null;
}

function isMissingCustomerError(e: any) {
    const code = e?.code;
    const msg = String(e?.message ?? "");
    return code === "resource_missing" || msg.includes("No such customer");
}

function safeInternalPathOrNull(path?: string | null) {
    const raw = String(path ?? "").trim();
    if (!raw) return null;
    if (raw.startsWith("//")) return null;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return null;
    return raw.startsWith("/") ? raw : `/${raw}`;
}


export function billingConfig() {
    const monthlyPriceId = process.env.STRIPE_PRICE_MONTHLY_ID!;
    const yearlyPriceId = process.env.STRIPE_PRICE_YEARLY_ID!;
    const trialDays = Number(process.env.TRIAL_DAYS ?? 7);
    const appUrl = process.env.AUTH_URL!;
    if (!monthlyPriceId || !yearlyPriceId || !appUrl) {
        throw new Error("Missing STRIPE_PRICE_*_ID or AUTH_URL");
    }
    return {monthlyPriceId, yearlyPriceId, trialDays, appUrl};
}

function toDate(sec?: number | null) {
    return typeof sec === "number" ? new Date(sec * 1000) : null;
}

function mapStatus(s: Stripe.Subscription.Status): StripeSubscriptionStatus {
    // Stripe status strings match your Prisma enum names
    switch (s) {
        case "trialing":
        case "active":
        case "past_due":
        case "unpaid":
        case "canceled":
        case "incomplete":
        case "incomplete_expired":
        case "paused":
            return s;
        default:
            return "incomplete";
    }
}

function formatMoney(amount: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
        maximumFractionDigits: 0,
    }).format(amount);
}

// Add near the top with your other helpers
function unitAmountMinorForCurrency(price: Stripe.Price, currency: string): number | null {
    const cur = currency.toLowerCase();

    // If requested currency is the price base currency
    if ((price.currency ?? "").toLowerCase() === cur) {
        return priceUnitAmountMinor(price);
    }

    const opts: any = (price as any).currency_options;
    const o = opts?.[cur];
    if (!o) return null;

    if (typeof o.unit_amount === "number") return o.unit_amount;
    if (typeof o.unit_amount_decimal === "string") {
        const n = Number(o.unit_amount_decimal);
        return Number.isFinite(n) ? Math.round(n) : null;
    }

    return null;
}

export async function getPricePresentation(intlLocale = "en-US", desiredCurrency?: string) {
    const { monthlyPriceId, yearlyPriceId, trialDays } = billingConfig();

    // fallbacks
    let currency = (desiredCurrency ?? "usd").toLowerCase();
    let monthlyUnitAmountMinor = 1000;
    let yearlyUnitAmountMinor = 10000;

    let monthlyPriceLabel = "$10 / mo";
    let yearlyPriceLabel = "$100 / yr";
    let yearlySavingsLabel: string | null = null;

    try {
        const [pM, pY] = await Promise.all([
            stripe.prices.retrieve(monthlyPriceId,{ expand: ["currency_options"] }),
            stripe.prices.retrieve(yearlyPriceId,{ expand: ["currency_options"] }),
        ]);

        // If caller didn’t specify currency, start from the Price base currency
        if (!desiredCurrency) {
            currency = (pM.currency ?? "usd").toLowerCase();
        }

        const m = unitAmountMinorForCurrency(pM, currency);
        const y = unitAmountMinorForCurrency(pY, currency);

        // If currency option missing, fall back to price base currency
        if (m == null || y == null) {
            currency = (pM.currency ?? "usd").toLowerCase();
            monthlyUnitAmountMinor = unitAmountMinorForCurrency(pM, currency) ?? 0;
            yearlyUnitAmountMinor = unitAmountMinorForCurrency(pY, currency) ?? 0;
        } else {
            monthlyUnitAmountMinor = m;
            yearlyUnitAmountMinor = y;
        }

        monthlyPriceLabel = `${formatMoneyMinor(monthlyUnitAmountMinor, currency, intlLocale)} / mo`;
        yearlyPriceLabel = `${formatMoneyMinor(yearlyUnitAmountMinor, currency, intlLocale)} / yr`;
        // console.log("MONTHLY priceId", monthlyPriceId, "currency_options", Object.keys((pM as any).currency_options ?? {}));
        // console.log("YEARLY  priceId", yearlyPriceId, "currency_options", Object.keys((pY as any).currency_options ?? {}));
        if (monthlyUnitAmountMinor > 0 && yearlyUnitAmountMinor > 0) {
            const impliedYear = monthlyUnitAmountMinor * 12;
            const pct = Math.round(((impliedYear - yearlyUnitAmountMinor) / impliedYear) * 100);
            if (Number.isFinite(pct) && pct > 0) yearlySavingsLabel = `Save ${pct}%`;
        }
    } catch {
        // keep fallbacks
    }

    return {
        monthlyPriceId,
        yearlyPriceId,
        trialDays,
        currency,
        monthlyUnitAmountMinor,
        yearlyUnitAmountMinor,
        monthlyPriceLabel,
        yearlyPriceLabel,
        yearlySavingsLabel,
    };
}// src/lib/billing/stripeService.ts
export async function ensureStripeCustomer(userId: string) {
    const u = await prisma.user.findUnique({
        where: {id: userId},
        select: {email: true, stripeCustomerId: true},
    });
    if (!u) throw new Error("User not found");

    // If we have an id, verify it exists in Stripe (and isn’t deleted)
    if (u.stripeCustomerId) {
        try {
            const got = await stripe.customers.retrieve(u.stripeCustomerId);

            // Stripe can return a DeletedCustomer object
            if ((got as any)?.deleted) {
                throw Object.assign(new Error("Stripe customer deleted"), {code: "resource_missing"});
            }

            return u.stripeCustomerId;
        } catch (e: any) {
            const code = e?.code;
            const msg = String(e?.message ?? "");

            // ✅ Repair only on “customer missing”
            if (code === "resource_missing" || msg.includes("No such customer")) {
                await prisma.user.update({
                    where: {id: userId},
                    data: {stripeCustomerId: null},
                });
            } else {
                // real error (bad key, network, etc.)
                throw e;
            }
        }
    }

    // Create a new Stripe customer + persist
    const customer = await stripe.customers.create({
        email: u.email ?? undefined,
        metadata: {userId},
    });

    await prisma.user.update({
        where: {id: userId},
        data: {stripeCustomerId: customer.id},
    });

    return customer.id;
}



function stripeCheckoutLocaleFromAppLocale(appLocale?: string | null): Stripe.Checkout.SessionCreateParams.Locale {
    const l = String(appLocale ?? "").toLowerCase();
    if (l === "fr"||l=="ht") return "fr";
    if (l === "en") return "en";
    return "auto"; // ht not supported; Stripe will choose best match
}

export async function createCheckoutSession(args: {
    userId: string;
    priceId: string;
    useTrial: boolean;
    callbackUrl: string;
    currency?: "usd" | "htg";
    appLocale?: string | null;
}) {
    const { appUrl, trialDays } = billingConfig();

    const cb = safeInternalPathOrNull(args.callbackUrl) ?? "/billing";

    const localeSeg = cb.split("/").filter(Boolean)[0];
    const hasLocale = localeSeg && localeSeg.length === 2;

    const successPath = hasLocale ? `/${localeSeg}/billing/success` : `/billing/success`;
    const billingPath = hasLocale ? `/${localeSeg}/billing` : `/billing`;

    const success_url =
        `${appUrl}${successPath}` +
        `?session_id={CHECKOUT_SESSION_ID}` +
        `&next=${encodeURIComponent(cb)}`;

    const cancel_url =
        `${appUrl}${billingPath}` +
        `?next=${encodeURIComponent(cb)}` +
        `&canceled=1`;

    const stripeLocale = stripeCheckoutLocaleFromAppLocale(args.appLocale ?? (hasLocale ? localeSeg : null));

    const checkout = await withValidCustomer(args.userId, (customerId) =>
        stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            line_items: [{ price: args.priceId, quantity: 1 }],
            allow_promotion_codes: true,

            // ✅ Checkout language/formatting
            locale: stripeLocale, // supported list is limited; "auto" works broadly :contentReference[oaicite:5]{index=5}

            // ✅ Force currency to match what you showed in your UI
            // Requires your Price to have currency_options[htg] configured.
            ...(args.currency ? { currency: args.currency } : {}),

            subscription_data: {
                ...(args.useTrial ? { trial_period_days: trialDays } : {}),
                metadata: { userId: args.userId, priceId: args.priceId, currency: args.currency ?? "" },
            },

            client_reference_id: args.userId,
            success_url,
            cancel_url,
        })
    );

    return { url: checkout.url };
}
export async function createBillingPortalSession(userId: string) {
    const {appUrl} = billingConfig();

    const portal = await withValidCustomer(userId, (customerId) =>
        stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${appUrl}/billing`,
        }),
    );

    return {url: portal.url};
}

export async function upsertFromStripeSubscription(sub: Stripe.Subscription, hintedUserId?: string | null) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

    const user =
        (hintedUserId
            ? await prisma.user.findUnique({
                where: {id: hintedUserId},
                select: {id: true, trialUsedAt: true, stripeCustomerId: true}
            })
            : null) ??
        (await prisma.user.findUnique({
            where: {stripeCustomerId: customerId},
            select: {id: true, trialUsedAt: true, stripeCustomerId: true}
        }));

    if (!user) return null;

    // keep stripeCustomerId aligned
    if (!user.stripeCustomerId) {
        await prisma.user.update({where: {id: user.id}, data: {stripeCustomerId: customerId}});
    }

    const priceId = sub.items.data[0]?.price?.id ?? null;
    const currentPeriodEnd = toDate(subscriptionPeriodEndSec(sub));
    const trialEnd = toDate(sub.trial_end);

    await prisma.subscription.upsert({
        where: {stripeSubscriptionId: sub.id},
        create: {
            userId: user.id,
            stripeCustomerId: customerId,
            stripeSubscriptionId: sub.id,
            status: mapStatus(sub.status),
            priceId,
            currentPeriodEnd,
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            trialEnd,
        },
        update: {
            userId: user.id,
            stripeCustomerId: customerId,
            status: mapStatus(sub.status),
            priceId,
            currentPeriodEnd,
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            trialEnd,
        },
    });

    if (!user.trialUsedAt && sub.status === "trialing") {
        await prisma.user.update({where: {id: user.id}, data: {trialUsedAt: new Date()}});
    }

    return {userId: user.id, status: sub.status, priceId, currentPeriodEnd, trialEnd, subscriptionId: sub.id};
}

/**
 * Optional but recommended: “sync-on-read”
 * Pull Stripe subscriptions and upsert them so UI/entitlement reflects Stripe immediately
 * even if webhook is delayed.
 */
export async function syncSubscriptionsForUser(userId: string) {
    // ✅ do NOT create a Stripe customer here
    const u = await prisma.user.findUnique({
        where: {id: userId},
        select: {stripeCustomerId: true},
    });

    const customerId = u?.stripeCustomerId ?? null;
    if (!customerId) return;

    // ✅ if stale/missing, clear and stop (prevents 500s in /status)
    try {
        const got = await stripe.customers.retrieve(customerId);
        if ((got as any)?.deleted) {
            await prisma.user.update({
                where: {id: userId},
                data: {stripeCustomerId: null},
            });
            return;
        }
    } catch (e: any) {
        if (isMissingCustomerError(e)) {
            await prisma.user.update({
                where: {id: userId},
                data: {stripeCustomerId: null},
            });
            return;
        }
        throw e;
    }

    const list = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
        expand: ["data.items.data.price"],
    });

    for (const sub of list.data) {
        await upsertFromStripeSubscription(sub, userId);
    }
}


// src/lib/billing/stripeService.ts (top)

// function isMissingCustomerError(e: any) {
//   const code = e?.code;
//   const msg = String(e?.message ?? "");
//   return code === "resource_missing" || msg.includes("No such customer");
// }
//
// function safeInternalPathOrNull(path?: string | null) {
//   const raw = String(path ?? "").trim();
//   if (!raw) return null;
//   if (raw.startsWith("//")) return null;
//   if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return null;
//   return raw.startsWith("/") ? raw : `/${raw}`;
// }

async function clearStripeCustomerId(userId: string) {
    await prisma.user.update({
        where: {id: userId},
        data: {stripeCustomerId: null},
    });
}

export async function getOrCreateStripeCustomerId(userId: string) {
    const u = await prisma.user.findUnique({
        where: {id: userId},
        select: {email: true, stripeCustomerId: true},
    });
    if (!u) throw new Error("User not found");

    if (u.stripeCustomerId) {
        try {
            const got = await stripe.customers.retrieve(u.stripeCustomerId);
            if ((got as any)?.deleted) throw Object.assign(new Error("deleted"), {code: "resource_missing"});
            return u.stripeCustomerId;
        } catch (e: any) {
            if (isMissingCustomerError(e)) {
                await clearStripeCustomerId(userId);
            } else {
                throw e;
            }
        }
    }

    const created = await stripe.customers.create({
        email: u.email ?? undefined,
        metadata: {userId},
    });

    await prisma.user.update({
        where: {id: userId},
        data: {stripeCustomerId: created.id},
    });

    return created.id;
}


async function withValidCustomer<T>(
    userId: string,
    fn: (customerId: string) => Promise<T>,
): Promise<T> {
    try {
        const customerId = await getOrCreateStripeCustomerId(userId);
        return await fn(customerId);
    } catch (e: any) {
        if (isMissingCustomerError(e) && e?.param === "customer") {
            // clear + retry once
            await clearStripeCustomerId(userId);
            const customerId = await getOrCreateStripeCustomerId(userId);
            return await fn(customerId);
        }
        throw e;
    }
}

function minItemPeriodEndSec(sub: Stripe.Subscription): number | null {
    const secs =
        (sub.items?.data ?? [])
            .map((it: any) => it?.current_period_end)
            .filter((x: any): x is number => typeof x === "number");

    return secs.length ? Math.min(...secs) : null;
}

function subscriptionPeriodEndSec(sub: Stripe.Subscription): number | null {
    // Old Stripe API versions have sub.current_period_end
    const s = (sub as any).current_period_end;
    if (typeof s === "number") return s;

    // Newer versions: item-level periods
    return minItemPeriodEndSec(sub);
}