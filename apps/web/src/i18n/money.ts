// src/i18n/money.ts

export function toIntlLocale(appLocale: string) {
    if (appLocale === "en") return "en-US";
    if (appLocale === "fr") return "fr-FR";
    if (appLocale === "ht") return "ht-HT";
    return appLocale;
}

/**
 * amountMinor b = Stripe minor units (cents, etc.). Works for zero-decimal currencies too.
 */
export function formatMoneyMinor(
    amountMinor: number,
    currency: string,
    intlLocale: string
) {
    const cur = currency.toUpperCase();

    const probe = new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency: cur,
    });

    const opts = probe.resolvedOptions();

    // TS-safe fallback (USD=2, JPY=0, etc.)
    const digits = typeof opts.maximumFractionDigits === "number"
        ? opts.maximumFractionDigits
        : 2;

    const value = amountMinor / Math.pow(10, digits);

    return new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency: cur,
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
    }).format(value);
}