import { NextResponse } from "next/server";
import { BILLING_CURRENCY_COOKIE, parseBillingCurrency } from "@/lib/billing/currency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isHttps(req: Request) {
    // Vercel sets x-forwarded-proto=https
    const xf = req.headers.get("x-forwarded-proto");
    if (xf) return xf.includes("https");
    // local dev fallback
    return req.url.startsWith("https://");
}

export async function POST(req: Request) {
    const body = await req.json().catch(() => null);
    const cur = parseBillingCurrency(body?.currency);

    if (!cur) {
        return NextResponse.json({ message: "Invalid currency" }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true, currency: cur });

    res.cookies.set({
        name: BILLING_CURRENCY_COOKIE,
        value: cur,
        httpOnly: false,
        sameSite: "lax",
        secure: isHttps(req), // ✅ works on localhost + production
        path: "/",
        maxAge: 60 * 60 * 24 * 180,
    });

    return res;
}