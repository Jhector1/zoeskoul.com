export function validateQualifiedMessageKeys(keys: string[]) {
    const seen = new Set<string>();

    for (const key of keys) {
        const normalized = String(key ?? "").trim();
        if (!normalized) continue;

        if (seen.has(normalized)) {
            throw new Error(`Duplicate fully qualified message key: "${normalized}"`);
        }

        seen.add(normalized);
    }
}