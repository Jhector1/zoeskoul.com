import { useTranslations } from "next-intl";

export const I18N_TAG = "@:";
const KEY_RE = /^[a-zA-Z0-9_.:-]+$/;

export type Values = Record<string, string | number | Date>;

export function isTaggedKey(x: unknown): x is string {
    if (typeof x !== "string") return false;
    if (!x.startsWith(I18N_TAG)) return false;
    const k = x.slice(I18N_TAG.length);
    return k.length > 0 && KEY_RE.test(k);
}

export function stripTag(x: string) {
    return x.slice(I18N_TAG.length);
}

function toText(value: unknown, fallback = ""): string {
    if (typeof value === "string") return value;
    if (value == null) return fallback;
    return String(value);
}

export function useTaggedT(namespace?: string) {
    const t0 = useTranslations(namespace as any);
    const DEV = process.env.NODE_ENV === "development";

    const has =
        ((t0 as any).has?.bind(t0) as ((k: string) => boolean) | undefined) ??
        (() => true);

    const miss = (key: string, fallback?: string): string => {
        if (fallback != null) return fallback;
        if (DEV) return namespace ? `${namespace}.${key}` : key;
        return "";
    };

    const tSafe = (key: string, values?: Values, fallback?: string): string => {
        try {
            if (!has(key)) return miss(key, fallback);
            const out = t0(key as any, values as any);
            return toText(out, miss(key, fallback));
        } catch {
            return miss(key, fallback);
        }
    };

    function rawSafe(key: string): unknown;
    function rawSafe(key: string, fallback: string): string;
    function rawSafe(key: string, fallback?: unknown): unknown {
        try {
            if (!has(key)) {
                return typeof fallback === "string" ? fallback : fallback ?? miss(key);
            }

            const raw = (t0 as any).raw ? (t0 as any).raw(key as any) : t0(key as any);

            if (typeof fallback === "string") {
                return toText(raw, fallback);
            }

            return raw ?? fallback ?? miss(key);
        } catch {
            if (typeof fallback === "string") return fallback;
            return fallback ?? miss(key);
        }
    }

    function resolve(textOrTagged?: string | null, fallback?: string): string;
    function resolve(textOrTagged?: string | null, values?: Values, fallback?: string): string;

    function resolve(
        textOrTagged?: string | null,
        valuesOrFallback?: Values | string,
        maybeFallback?: string
    ): string {
        const values =
            typeof valuesOrFallback === "object" && valuesOrFallback != null
                ? valuesOrFallback
                : undefined;

        const fallback =
            typeof valuesOrFallback === "string" ? valuesOrFallback : maybeFallback;

        if (!textOrTagged) return fallback ?? "";
        if (!isTaggedKey(textOrTagged)) return textOrTagged;

        const key = stripTag(textOrTagged);

        if (values) return tSafe(key, values, fallback);

        // important: still raw-based for markdown/code-safe tagged content
        return rawSafe(key, fallback ?? "") as string;
    }

    return { t: tSafe, raw: rawSafe, resolve };
}