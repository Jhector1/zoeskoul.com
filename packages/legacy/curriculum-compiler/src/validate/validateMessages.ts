function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
    const out: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
        const next = prefix ? `${prefix}.${key}` : key;

        if (value && typeof value === "object" && !Array.isArray(value)) {
            out.push(...flattenKeys(value as Record<string, unknown>, next));
        } else {
            out.push(next);
        }
    }

    return out;
}

export function flattenMessageKeys(obj: Record<string, unknown>) {
    return flattenKeys(obj).sort();
}