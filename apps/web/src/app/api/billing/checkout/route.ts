// src/app/api/billing/checkout/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCheckoutSession, billingConfig } from "@/lib/billing/stripeService";
import {getLocaleFromCookie} from "@/serverUtils";
import {resolveBillingCurrency} from "@/lib/billing/currency";

function safeInternalPath(path: unknown, fallback = "/") {
  const raw = typeof path === "string" ? path.trim() : "";
  if (!raw) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return fallback;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  const userId: string | null = (session as any)?.user?.id ?? null;
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const plan = body?.plan as "monthly" | "yearly" | undefined;
  const useTrial = Boolean(body?.useTrial);
  const callbackUrl = safeInternalPath(body?.callbackUrl, "/");

  if (plan !== "monthly" && plan !== "yearly") {
    return NextResponse.json({ message: "Invalid plan." }, { status: 400 });
  }

  const { monthlyPriceId, yearlyPriceId, trialDays } = billingConfig();
  const priceId = plan === "monthly" ? monthlyPriceId : yearlyPriceId;

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { trialUsedAt: true },
  });

  const canUseTrial = useTrial && !u?.trialUsedAt && trialDays > 0;
  const appLocale = await getLocaleFromCookie();     // "en", "fr", ...

  try {
    const billingCurrency = await resolveBillingCurrency();
    const appLocale = await getLocaleFromCookie();

    const out = await createCheckoutSession({
      userId,
      priceId,
      useTrial: canUseTrial,
      callbackUrl,
      currency: billingCurrency,
      appLocale,
    });

    if (!out.url) return NextResponse.json({ message: "Stripe session missing url." }, { status: 500 });

    return NextResponse.json({ url: out.url });
  } catch (e: any) {
    console.error("[/api/billing/checkout] ERROR", e);
    return NextResponse.json({ message: e?.message ?? "Checkout failed" }, { status: 500 });
  }
}