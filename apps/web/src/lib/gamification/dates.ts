export function startOfUtcDay(input: Date = new Date()): Date {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export function toUtcDayKey(input: Date = new Date()): string {
    return startOfUtcDay(input).toISOString().slice(0, 10);
}

export function isSameUtcDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
    if (!a || !b) return false;
    return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}

export function isYesterdayUtc(previous: Date | null | undefined, today: Date): boolean {
    if (!previous) return false;
    const prev = startOfUtcDay(previous).getTime();
    const cur = startOfUtcDay(today).getTime();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    return cur - prev === ONE_DAY;
}