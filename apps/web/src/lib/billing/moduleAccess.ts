import {
    buildAccessGateSearchParams,
    safeAccessPath,
} from "@/lib/access/accessGate";

export function buildBillingHref(args: {
    locale: string;
    next: string;
    reason?: string;
    subject?: string;
    back?: string;
    module?: string;
}) {
    const params = buildAccessGateSearchParams({
        next: args.next,
        back: args.back,
        reason: args.reason ?? "module",
        subject: args.subject,
        module: args.module,
    });

    // Billing uses `next`; account creation uses the synonymous callbackUrl.
    // Both are produced by the shared continuation contract, but only the
    // parameter relevant to this surface is exposed in its URL.
    params.delete("callbackUrl");
    return `/billing?${params.toString()}`;
}

export function safeInternalPath(path?: string | null, fallback = "/") {
    return safeAccessPath(path, fallback);
}
