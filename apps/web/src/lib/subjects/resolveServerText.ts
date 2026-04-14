import "server-only";
import { getTranslations } from "next-intl/server";

function stripTaggedKey(value: string): string {
    return value.startsWith("@:") ? value.slice(2) : value;
}

function looksLikeI18nKey(value: string): boolean {
    return /^(subjects|modules|sections|topics|reviewQuizUi|common)\./.test(value);
}

async function tryResolveKey(locale: string, key: string): Promise<string | null> {
    try {
        const t = await getTranslations({ locale });
        const value = t(key as any);

        if (value && value !== key) {
            return String(value).trim();
        }
    } catch {
        // ignore
    }

    return null;
}

export async function resolveServerText(args: {
    locale?: string;
    preferredKey?: string | null;
    dbValue?: string | null;
    fallback?: string | null;
    finalFallback: string;
}) {
    const {
        locale = "en",
        preferredKey = null,
        dbValue = null,
        fallback = null,
        finalFallback,
    } = args;

    const candidates = [preferredKey, dbValue, fallback]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean);

    for (const candidate of candidates) {
        const raw = stripTaggedKey(candidate);

        if (!raw) continue;

        if (looksLikeI18nKey(raw)) {
            const resolved = await tryResolveKey(locale, raw);
            if (resolved) return resolved;
            continue;
        }

        return raw;
    }

    return finalFallback;
}