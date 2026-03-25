import { z } from "zod";

export const ReviewSubjectSlugSchema = z.string().trim().min(1);
export const ReviewModuleSlugSchema = z.string().trim().min(1);
export const ReviewLocaleSchema = z.string().trim().min(1).max(16).default("en");

export function asTrimmedString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

export function pickModuleSlug(...values: unknown[]) {
    for (const value of values) {
        const s = asTrimmedString(value);
        if (s) return s;
    }
    return "";
}

export function pickLocale(value: unknown, fallback = "en") {
    const s = asTrimmedString(value);
    return s || fallback;
}