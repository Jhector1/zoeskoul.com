type MessageRef = {
    messageKey?: string;
};

export function normalizeText(value: unknown, fallback = ""): string {
    if (typeof value === "string") return value;
    if (value == null) return fallback;

    if (typeof value === "object") {
        const maybeRef = value as MessageRef;
        if (typeof maybeRef.messageKey === "string" && maybeRef.messageKey.trim()) {
            const parts = maybeRef.messageKey.split(".");
            return parts[parts.length - 1] ?? fallback;
        }
    }

    return String(value);
}

export function normalizeTextList(values: unknown, fallbackPrefix = "item"): string[] {
    if (!Array.isArray(values)) return [];
    return values.map((v, i) => normalizeText(v, `${fallbackPrefix}_${i}`));
}