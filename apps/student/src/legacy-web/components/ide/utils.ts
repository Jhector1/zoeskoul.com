export function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

export function cn(...cls: Array<string | false | undefined | null>) {
    return cls.filter(Boolean).join(" ");
}
