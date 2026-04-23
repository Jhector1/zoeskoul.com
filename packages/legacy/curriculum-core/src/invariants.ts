export function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

export function assertNonEmpty(value: unknown, label: string): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${label} must be a non-empty string`);
    }
    return value;
}

export function assertNoDot(value: string, label: string) {
    if (value.includes(".")) {
        throw new Error(`${label} must not contain a dot: ${value}`);
    }
}