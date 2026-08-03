import {
    normalizeLocale,
    requestAppPreferencesUpdate,
} from "@zoeskoul/preferences";

export function persistLocale(nextLocale: string) {
    const locale = normalizeLocale(nextLocale);
    try {
        localStorage.setItem("learnoir:locale", locale);
    } catch {}
    document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    requestAppPreferencesUpdate({ locale });
}
