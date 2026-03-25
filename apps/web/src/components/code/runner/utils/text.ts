export function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

export function cleanTermText(s: string) {
    return (s ?? "").replace(/\r/g, "").replace(/\x1b\[[0-9;]*m/g, "");
}

export function toLines(s: string) {
    const raw = cleanTermText(s ?? "");
    if (!raw) return [];
    const parts = raw.split("\n").map((x) => x.replace(/\r$/, ""));
    while (parts.length && parts[parts.length - 1] === "") parts.pop();
    return parts;
}
