export function normalizeSpecModuleOrder(
    rawOrder: number | undefined,
    moduleIndex: number,
): number {
    if (typeof rawOrder !== "number" || !Number.isFinite(rawOrder)) {
        return moduleIndex + 1;
    }

    if (rawOrder <= 0) {
        return moduleIndex + 1;
    }

    return Math.floor(rawOrder);
}

export function moduleOrderToIndex(order: number): number {
    if (!Number.isFinite(order) || order < 1) {
        throw new Error(`Invalid 1-based module order: ${order}`);
    }

    return order - 1;
}