// src/lib/billing/stripeService.ts
import "server-only";
import {prisma} from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { resolvePlatformBillingCatalog, requirePlatformPriceForProduct } from "@zoeskoul/platform-server/billing/productCatalog";
import { isVerifiedPlatformSubscriptionOwner } from "@zoeskoul/platform-server/billing/customerOwnership";
import { synchronizePlatformCustomerSubscriptions, collectPlatformSubscriptionPages } from "@zoeskoul/platform-server/billing/platformSubscriptionLifecycle";
import { createPlatformBillingPortalSession } from "@zoeskoul/platform-server/billing/platformPortalLifecycle";
import {
    classifyPlatformCheckoutIntent,
    createOrRecoverPlatformSubscriptionCheckout,
    expirePlatformCheckoutSession,
    findPlatformCheckoutAttemptSession,
} from "@zoeskoul/platform-server/billing/platformCheckoutLifecycle";

import {
    getOrCreatePlatformStripeCustomerId,
    withValidPlatformStripeCustomer,
    isMissingPlatformStripeCustomerError as isMissingCustomerError,
    type PlatformStripeCustomerDeps,
} from "@zoeskoul/platform-server/billing/platformStripeCustomer";
import type Stripe from "stripe";
import type { StripeSubscriptionStatus } from "@zoeskoul/db";
import { formatMoneyMinor } from "@/i18n/money";
import {
  buildStripeCheckoutIdempotencyKey,
  isCheckoutAttemptId,
} from "@/lib/billing/checkoutAttempt";
import { releaseBillingCheckoutReservation } from "@/lib/billing/billingCheckoutReservation";
import { reconcileBuilderAiBillingForUser } from "@/lib/billing/reconcileBuilderAiBillingForUser";
import {registeredBuilderStripeProducts,stripePriceProductId,verifiedStripePlatformProduct} from "@zoeskoul/platform-server/billing/platformStripeProductIdentity";

function priceUnitAmountMinor(p: Stripe.Price): number | null {
    if (typeof p.unit_amount === "number") return p.unit_amount;
    if (typeof p.unit_amount_decimal === "string") {
        const n = Number(p.unit_amount_decimal);
        return Number.isFinite(n) ? Math.round(n) : null;
    }
    return null;
}


function safeInternalPathOrNull(path?: string | null) {
    const raw = String(path ?? "").trim();
    if (!raw) return null;
    if (raw.startsWith("//")) return null;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return null;
    return raw.startsWith("/") ? raw : `/${raw}`;
}


export function billingConfig() {
    const catalog = resolvePlatformBillingCatalog(process.env);
    const monthlyPriceId = catalog.find(p => p.product === "learning" && p.tier === "monthly")?.priceId;
    const yearlyPriceId = catalog.find(p => p.product === "learning" && p.tier === "yearly")?.priceId;
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
            getStripe().prices.retrieve(monthlyPriceId,{ expand: ["currency_options"] }),
            getStripe().prices.retrieve(yearlyPriceId,{ expand: ["currency_options"] }),
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
function stripeCheckoutLocaleFromAppLocale(appLocale?: string | null): Stripe.Checkout.SessionCreateParams.Locale {
    const l = String(appLocale ?? "").toLowerCase();
    if (l === "fr"||l=="ht") return "fr";
    if (l === "en") return "en";
    return "auto"; // ht not supported; Stripe will choose best match
}


export type CheckoutSessionIntentMatch = "match" | "mismatch" | "unknown";

export function classifyCheckoutSessionIntent(args: {
    session: Stripe.Checkout.Session;
    priceId: string;
    useTrial: boolean;
}): CheckoutSessionIntentMatch {
    return classifyPlatformCheckoutIntent(args);
}

export async function expireOpenCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    const stripe = getStripe();
    return expirePlatformCheckoutSession({
        sessionId,
        expire: (id) => stripe.checkout.sessions.expire(id),
        retrieve: (id) => stripe.checkout.sessions.retrieve(id),
    });
}

export async function findExistingCheckoutSessionForAttempt(args: {
    userId: string;
    checkoutAttemptId: string;
}) {
    if (!isCheckoutAttemptId(args.checkoutAttemptId)) return null;

    const user = await prisma.user.findUnique({
        where: { id: args.userId },
        select: { stripeCustomerId: true },
    });
    const customerId = user?.stripeCustomerId;
    if (!customerId) return null;

    try {
        const sessions = await getStripe().checkout.sessions.list({
            customer: customerId,
            limit: 100,
            expand: ["data.line_items"],
        });
        return findPlatformCheckoutAttemptSession({
            sessions: sessions.data,
            checkoutAttemptId: args.checkoutAttemptId,
            statuses: ["open", "complete", "expired"],
        });
    } catch (error) {
        if (isMissingCustomerError(error)) return null;
        throw error;
    }
}

export async function createCheckoutSession(args: {
    userId: string;
    priceId: string;
    useTrial: boolean;
    callbackUrl: string;
    currency?: "usd" | "htg";
    appLocale?: string | null;
    checkoutAttemptId: string;
    checkoutExpiresAt?: Date;
    promotion?: {
        id: string;
        stripeCouponId: string;
        percentOff: number;
    } | null;
}) {
    const { appUrl, trialDays } = billingConfig();
    // This learning Checkout may never charge a Builder plan or merchant-store price.
    requirePlatformPriceForProduct({
        catalog: resolvePlatformBillingCatalog(process.env),
        product: "learning",
        priceId: args.priceId,
    });

    const cb = safeInternalPathOrNull(args.callbackUrl) ?? "/billing";

    const localeSeg = cb.split("/").filter(Boolean)[0];
    const hasLocale = Boolean(localeSeg && localeSeg.length === 2);

    const successPath = hasLocale
        ? `/${localeSeg}/billing/success`
        : "/billing/success";
    const billingPath = hasLocale
        ? `/${localeSeg}/billing`
        : "/billing";

    const attemptQuery =
        `&checkout_attempt_id=${encodeURIComponent(args.checkoutAttemptId)}`;

    const success_url =
        `${appUrl}${successPath}` +
        `?session_id={CHECKOUT_SESSION_ID}` +
        `&next=${encodeURIComponent(cb)}` +
        attemptQuery;

    const cancel_url =
        `${appUrl}${billingPath}` +
        `?next=${encodeURIComponent(cb)}` +
        `&canceled=1` +
        attemptQuery;

    const stripeLocale = stripeCheckoutLocaleFromAppLocale(
        args.appLocale ?? (hasLocale ? localeSeg : null),
    );

    const checkout = await withValidCustomer(args.userId, async (customerId) => {
        const stripe = getStripe();

        return createOrRecoverPlatformSubscriptionCheckout({
            checkoutAttemptId: args.checkoutAttemptId,
            priceId: args.priceId,
            useTrial: args.useTrial,
            successUrl: success_url,
            listSessions: async () => (await stripe.checkout.sessions.list({
                customer: customerId,
                limit: 10,
                expand: ["data.line_items"],
            })).data,
            createSession: () => stripe.checkout.sessions.create(
            {
                mode: "subscription",
                customer: customerId,
                line_items: [{ price: args.priceId, quantity: 1 }],
                ...(args.promotion
                    ? {
                        discounts: [{ coupon: args.promotion.stripeCouponId }],
                    }
                    : { allow_promotion_codes: true }),
                locale: stripeLocale,
                ...(args.currency ? { currency: args.currency } : {}),
                ...(args.checkoutExpiresAt
                    ? {
                        expires_at: Math.floor(
                            args.checkoutExpiresAt.getTime() / 1000,
                        ),
                    }
                    : {}),
                metadata: {
                    userId: args.userId,
                    checkoutAttemptId: args.checkoutAttemptId,
                    priceId: args.priceId,
                    useTrial: args.useTrial ? "true" : "false",
                    ...(args.promotion ? {
                        promotionCampaignId: args.promotion.id,
                        promotionPercentOff: String(args.promotion.percentOff),
                    } : {}),
                },
                subscription_data: {
                    ...(args.useTrial
                        ? { trial_period_days: trialDays }
                        : {}),
                    metadata: {
                        userId: args.userId,
                        priceId: args.priceId,
                        currency: args.currency ?? "",
                        checkoutAttemptId: args.checkoutAttemptId,
                        ...(args.promotion ? {
                            promotionCampaignId: args.promotion.id,
                            promotionPercentOff: String(args.promotion.percentOff),
                        } : {}),
                    },
                },
                client_reference_id: args.userId,
                success_url,
                cancel_url,
            },
            {
                idempotencyKey: buildStripeCheckoutIdempotencyKey(
                    args.checkoutAttemptId,
                ),
            },
        ),
        });
    });

    return { id: checkout.id, url: checkout.url };
}

export async function createBillingPromotionCoupon(args: {
    campaignId: string;
    name: string;
    percentOff: number;
    couponDuration: "once" | "repeating" | "forever";
    couponDurationMonths: number | null;
    endsAt: Date;
}) {
    return getStripe().coupons.create({
        name: args.name,
        percent_off: args.percentOff,
        duration: args.couponDuration,
        ...(args.couponDuration === "repeating"
            ? { duration_in_months: args.couponDurationMonths! }
            : {}),
        redeem_by: Math.floor(args.endsAt.getTime() / 1000),
        metadata: {
            zoeskoulBillingPromotionCampaignId: args.campaignId,
            zoeskoulPromotionKind: "billing_campaign",
        },
    });
}

export function isDeterministicStripeCheckoutRequestError(error: unknown) {
    if (typeof error !== "object" || error === null) return false;
    const candidate = error as {
        type?: unknown;
        rawType?: unknown;
    };
    return candidate.type === "StripeInvalidRequestError" ||
        candidate.rawType === "invalid_request_error";
}

export async function createBillingPortalSession(userId: string) {
    const { appUrl } = billingConfig();
    return createPlatformBillingPortalSession({
        userId,
        returnUrl: `${appUrl}/billing`,
        customerDeps: platformStripeCustomerDeps,
        createSession: (customerId, returnUrl) => getStripe().billingPortal.sessions.create({
            customer: customerId, return_url: returnUrl,
        }),
    });
}

export async function resumeScheduledSubscriptionForUser(args: {
    userId: string;
    subscriptionId: string;
}) {
    const local = await prisma.subscription.findFirst({
        where: {
            userId: args.userId,
            stripeSubscriptionId: args.subscriptionId,
        },
        select: {
            stripeCustomerId: true,
            status: true,
            cancelAtPeriodEnd: true,
        },
    });

    if (!local) return null;
    if (
        local.status !== "trialing" &&
        local.status !== "active"
    ) {
        return null;
    }

    // The subscription row alone cannot authorize a Stripe mutation. Confirm
    // that the caller still owns the canonical platform Stripe customer before
    // clearing a scheduled cancellation on the provider.
    const owner = await prisma.user.findUnique({
        where: { id: args.userId },
        select: { stripeCustomerId: true },
    });
    if (
        !owner?.stripeCustomerId ||
        !local.stripeCustomerId ||
        owner.stripeCustomerId !== local.stripeCustomerId
    ) {
        return null;
    }

    const stripe = getStripe();
    const remote = await stripe.subscriptions.retrieve(
        args.subscriptionId,
    );
    const remoteCustomerId =
        typeof remote.customer === "string"
            ? remote.customer
            : remote.customer.id;

    if (remoteCustomerId !== owner.stripeCustomerId) {
        throw new Error("Subscription customer mismatch.");
    }

    const remoteUserId = remote.metadata?.userId?.trim();
    if (remoteUserId && remoteUserId !== args.userId) {
        throw new Error("Subscription ownership mismatch.");
    }

    if (
        remote.status !== "trialing" &&
        remote.status !== "active"
    ) {
        await upsertFromStripeSubscription(remote, args.userId);
        return null;
    }

    const reconciled = remote.cancel_at_period_end
        ? await stripe.subscriptions.update(
            args.subscriptionId,
            { cancel_at_period_end: false },
        )
        : remote;

    const saved = await upsertFromStripeSubscription(
        reconciled,
        args.userId,
    );
    if (!saved) return null;

    return {
        ...saved,
        cancelAtPeriodEnd: Boolean(
            reconciled.cancel_at_period_end,
        ),
    };
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

    if (!user || !isVerifiedPlatformSubscriptionOwner({
        userId: user.id,
        storedStripeCustomerId: user.stripeCustomerId,
        subscriptionCustomerId: customerId,
        subscriptionMetadataUserId: sub.metadata?.userId,
    })) return null;

    const priceId = sub.items.data[0]?.price?.id ?? null;
    const catalog = resolvePlatformBillingCatalog(process.env);
    const billingProduct = sub.items.data.length === 1 ? verifiedStripePlatformProduct({
        priceId, catalog, builderProductIds:registeredBuilderStripeProducts(process.env),
        stripeProductId:stripePriceProductId(sub.items.data[0]?.price?.product),
        subscriptionProductHint:sub.metadata?.billingProduct ?? null,
    }) : null;
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
            billingProduct,
            currentPeriodEnd,
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            trialEnd,
        },
        update: {
            userId: user.id,
            stripeCustomerId: customerId,
            status: mapStatus(sub.status),
            priceId,
            billingProduct,
            currentPeriodEnd,
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            trialEnd,
        },
    });

    await reconcileBuilderAiBillingForUser(user.id);

    const checkoutAttemptId = sub.metadata?.checkoutAttemptId;
    if (isCheckoutAttemptId(checkoutAttemptId)) {
        await releaseBillingCheckoutReservation(
            user.id,
            checkoutAttemptId,
        );
    }

    if (billingProduct === "learning" && !user.trialUsedAt && sub.status === "trialing") {
        await prisma.user.update({
            where: {id: user.id},
            data: {trialUsedAt: new Date()},
        });
    }

    return {userId: user.id, status: sub.status, priceId, currentPeriodEnd, trialEnd, subscriptionId: sub.id};
}

async function expireLocalSubscriptionsMissingFromStripe(
    userId: string,
    stripeSubscriptionIds: string[],
) {
    const staleWhere = stripeSubscriptionIds.length
        ? {
            userId,
            stripeSubscriptionId: { notIn: stripeSubscriptionIds },
            status: { in: ["active", "trialing", "past_due"] as StripeSubscriptionStatus[] },
        }
        : {
            userId,
            status: { in: ["active", "trialing", "past_due"] as StripeSubscriptionStatus[] },
        };

    await prisma.subscription.updateMany({
        where: staleWhere,
        data: {
            status: "canceled",
            currentPeriodEnd: null,
            trialEnd: null,
            cancelAtPeriodEnd: false,
        },
    });

    await reconcileBuilderAiBillingForUser(userId);
}

/**
 * Optional but recommended: “sync-on-read”
 * Pull Stripe subscriptions and upsert them so UI/entitlement reflects Stripe immediately
 * even if webhook is delayed.
 */
export async function syncSubscriptionsForUser(userId: string) {
    return synchronizePlatformCustomerSubscriptions({
        userId,
        deps: {
            readCustomerId: async (id) => (await prisma.user.findUnique({
                where: {id}, select: {stripeCustomerId: true},
            }))?.stripeCustomerId ?? null,
            // Normalize Stripe's Customer.deleted (void) / DeletedCustomer.deleted (true)
            // into the shared platform billing contract without changing provider behavior.
            verifyCustomer: async (id) => {
                const customer = await getStripe().customers.retrieve(id);
                return { deleted: customer.deleted === true };
            },
            clearCustomerId: (id) => prisma.user.update({
                where: {id}, data: {stripeCustomerId: null},
            }),
            fetchAllSubscriptions: (customerId) => collectPlatformSubscriptionPages({
                listPage: async (cursor) => getStripe().subscriptions.list({
                    customer: customerId,
                    status: "all",
                    limit: 100,
                    expand: ["data.items.data.price"],
                    ...(cursor ? {starting_after: cursor} : {}),
                }),
            }),
            persistSubscription: (sub, id) => upsertFromStripeSubscription(sub, id),
            expireMissing: (id, ids) => expireLocalSubscriptionsMissingFromStripe(id, [...ids]),
            isMissingCustomerError,
        },
    });
}

/** Web-specific adapter only: reusable customer lifecycle lives in platform-server. */
const platformStripeCustomerDeps: PlatformStripeCustomerDeps = {
    findUser: (userId) => prisma.user.findUnique({
        where: { id: userId }, select: { email: true, stripeCustomerId: true },
    }),
    setCustomerId: (userId, customerId) => prisma.user.update({
        where: { id: userId }, data: { stripeCustomerId: customerId },
    }),
    retrieveCustomer: (customerId) => getStripe().customers.retrieve(customerId),
    createCustomer: (userId, email) => getStripe().customers.create({
        email: email ?? undefined, metadata: { userId },
    }),
};

/** Shared platform billing customer, not a generated merchant storefront customer. */
export async function getOrCreateStripeCustomerId(userId: string): Promise<string> {
    return getOrCreatePlatformStripeCustomerId({ userId, deps: platformStripeCustomerDeps });
}

async function withValidCustomer<T>(
    userId: string, fn: (customerId: string) => Promise<T>,
): Promise<T> {
    return withValidPlatformStripeCustomer({
        userId, deps: platformStripeCustomerDeps, operate: fn,
    });
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
