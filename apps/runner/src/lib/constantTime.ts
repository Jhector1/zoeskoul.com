import crypto from "node:crypto";

export function safeEqualText(a?: string | null, b?: string | null) {
    const aa = Buffer.from(String(a ?? ""), "utf8");
    const bb = Buffer.from(String(b ?? ""), "utf8");
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
}