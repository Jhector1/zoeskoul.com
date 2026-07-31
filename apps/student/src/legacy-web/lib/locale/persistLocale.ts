export function persistLocale(nextLocale: string) {
    try {
        localStorage.setItem("learnoir:locale", nextLocale);
    } catch {}
    document.cookie = `NEXT_LOCALE=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}