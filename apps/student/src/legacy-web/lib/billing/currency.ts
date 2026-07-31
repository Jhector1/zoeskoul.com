import "server-only";
import { cookies, headers } from "next/headers";

export type BillingCurrency = "usd" | "htg";
export const BILLING_CURRENCY_COOKIE = "PREFERRED_CURRENCY";

export function parseBillingCurrency(x: unknown): BillingCurrency | null {
    const s = String(x ?? "").toLowerCase().trim();
    if (s === "usd") return "usd";
    if (s === "htg") return "htg";
    return null;
}

function getCountryFromHeaders(h: Headers): string | null {
    const country =
        h.get("x-vercel-ip-country") ??
        h.get("cf-ipcountry") ??
        h.get("x-country") ??
        null;

    const s = String(country ?? "").trim().toUpperCase();
    return s ? s : null;
}

export async function resolveBillingCurrency(): Promise<BillingCurrency> {
    const c = await cookies();
    const preferred = parseBillingCurrency(c.get(BILLING_CURRENCY_COOKIE)?.value);
    if (preferred) return preferred;

    const h = await headers();
    const country = getCountryFromHeaders(h);
    if (country === "HT") return "htg";

    return "usd";
}