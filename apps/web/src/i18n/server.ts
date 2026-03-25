import "server-only";
import { getTranslations } from "next-intl/server";

type AnyObj = Record<string, any>;

export async function getServerI18n(namespace?: string) {
    const t0 = await getTranslations(namespace as any);

    const has =
        ((t0 as any).has?.bind(t0) as ((k: string) => boolean) | undefined) ??
        (() => false); // server: safest default is false

    const raw =
        ((t0 as any).raw?.bind(t0) as ((k: string) => any) | undefined) ??
        null;

    const tMaybe = (key: string, fallback: string, values?: AnyObj) => {
        try {
            if (!has(key)) return fallback;
            const out = t0(key as any, values as any);
            // In your config you may return "" in prod; fallback to DB if empty:
            return out ? String(out) : fallback;
        } catch {
            return fallback;
        }
    };

    const rawMaybe = <T,>(key: string, fallback: T): T => {
        try {
            if (!raw) return fallback;
            if (!has(key)) return fallback;
            const v = raw(key);
            return (v ?? fallback) as T;
        } catch {
            return fallback;
        }
    };

    return { tMaybe, rawMaybe };
}