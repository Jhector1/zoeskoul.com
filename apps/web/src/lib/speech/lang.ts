// src/lib/speech/lang.ts
export type SpeechLocaleInfo = {
    raw: string;
    lower: string;
    isHaitian: boolean;
    // candidates for OpenAI `language` (try in order)
    languageCandidates: string[]; // e.g. ["ht", ""]
};

export function normalizeSpeechLocale(locale?: string | null): SpeechLocaleInfo {
    const raw = String(locale ?? "").trim();
    const lower = raw.toLowerCase();

    // Haitian Creole variants
    const isHaitian =
        lower === "ht" || lower.startsWith("ht-") || lower === "hat" || lower.includes("hait");

    // For non-HT, pass ISO-ish short code when possible
    // For HT, try "ht" first, then fallback to "" (omit)
    if (isHaitian) return { raw, lower, isHaitian: true, languageCandidates: ["ht", ""] };

    if (!raw) return { raw, lower, isHaitian: false, languageCandidates: [""] };

    // Keep it short; OpenAI expects ISO-639-1 like "en", "fr", etc. :contentReference[oaicite:4]{index=4}
    const short = lower.split(/[-_]/)[0].slice(0, 8);
    return { raw, lower, isHaitian: false, languageCandidates: [short || ""] };
}

export function normalizePhrase(s: string) {
    return String(s ?? "")
        .replace(/[’‘]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}