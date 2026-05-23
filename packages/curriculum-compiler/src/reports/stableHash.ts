import { createHash } from "node:crypto";

function sortJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortJsonValue);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, sortJsonValue(child)]),
        );
    }

    return value;
}

export function stableJsonStringify(value: unknown): string {
    return JSON.stringify(sortJsonValue(value), null, 2);
}

export function sha256Text(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

export function sha256Json(value: unknown): string {
    return sha256Text(stableJsonStringify(value));
}
