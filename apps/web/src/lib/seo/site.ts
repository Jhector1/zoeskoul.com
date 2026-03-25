import type { AppLocale } from "./types";

export const SITE_URL =
    process.env.NEXT_PUBLIC_APP_URL || "https://zoeskoul.com";

export const SITE_NAME =
    process.env.NEXT_PUBLIC_APP_NAME || "ZoeSkoul";

export const LOCALES: AppLocale[] = ["en", "fr", "ht"];
export const DEFAULT_LOCALE: AppLocale = "en";

export function getSiteUrl() {
    try {
        return new URL(SITE_URL);
    } catch {
        return new URL("https://zoeskoul.com");
    }
}

export function getOgLocale(locale: AppLocale) {
    switch (locale) {
        case "fr":
            return "fr_FR";
        case "ht":
            return "ht_HT";
        default:
            return "en_US";
    }
}

export function localizedPath(locale: AppLocale, path: string) {
    if (!path || path === "/") return `/${locale}`;
    return `/${locale}${path}`;
}
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "ZoeSkoul";

export function fillAppName(value: string) {
    return value.replaceAll("{appName}", APP_NAME);
}

export function fillAppNameArray(values: string[]) {
    return values.map(fillAppName);
}