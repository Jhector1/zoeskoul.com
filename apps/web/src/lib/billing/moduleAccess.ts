// src/lib/billing/moduleAccess.ts
export function buildBillingHref(args: {
    locale: string;
    next: string;
    reason?: string;
    subject?: string;
    back?: string;              // ✅ NEW

    module?: string;
}) {
    const p = new URLSearchParams();
    p.set("next", args.next);
    if (args.back) p.set("back", args.back);   // ✅ NEW

    p.set("reason", args.reason ?? "module");
    if (args.subject) p.set("subject", args.subject);
    if (args.module) p.set("module", args.module);
    return `/billing?${p.toString()}`;
}

export function safeInternalPath(path?: string | null, fallback = "/") {
    if (!path) return fallback;
    const raw = String(path).trim();
    if (!raw) return fallback;
    if (raw.startsWith("//")) return fallback;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return fallback;
    return raw.startsWith("/") ? raw : `/${raw}`;
}