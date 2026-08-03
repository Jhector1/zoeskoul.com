import { isTaggedKey, stripTag, type Values } from "@/i18n/tagged";

export type DeepResolved<T> =
    T extends string
        ? string
        : T extends Array<infer U>
            ? Array<DeepResolved<U>>
            : T extends object
                ? { [K in keyof T]: DeepResolved<T[K]> }
                : T;

// strict typed mode: resolver returns string
export function resolveDeepTagged<T>(
    input: T,
    resolver: (key: string, values?: Values) => string,
    values?: Values
): DeepResolved<T>;

// backward-compatible loose mode
export function resolveDeepTagged(
    input: unknown,
    resolver: (key: string, values?: Values) => unknown,
    values?: Values
): unknown;

export function resolveDeepTagged(
    input: unknown,
    resolver: (key: string, values?: Values) => unknown,
    values?: Values
): unknown {
    if (typeof input === "string") {
        if (isTaggedKey(input)) return resolver(stripTag(input), values);
        return input;
    }

    if (Array.isArray(input)) {
        return input.map((x) => resolveDeepTagged(x, resolver, values));
    }

    if (input && typeof input === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
            out[k] = resolveDeepTagged(v, resolver, values);
        }
        return out;
    }

    return input;
}