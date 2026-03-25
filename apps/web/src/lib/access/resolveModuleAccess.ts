// src/lib/access/resolveModuleAccess.ts
import { computeEffectiveAccess, type ModuleAccessConfig, type SubjectAccessConfig } from "./accessTypes";
import type { AccessSnapshot } from "./accessSnapshot";

export type ModuleAccessDecision =
    | { ok: true; paid: boolean }
    | {
    ok: false;
    paid: true;
    reason: "requires_login" | "requires_payment";
};

export function resolveModuleAccess(args: {
    subject: SubjectAccessConfig | null;
    module: ModuleAccessConfig;
    snapshot: AccessSnapshot;
    requireAll?: boolean; // emergency global paywall switch
}): ModuleAccessDecision {
    const requireAll = Boolean(args.requireAll);

    // force-all-paid unless module explicitly free
    if (requireAll && args.module.accessOverride !== "free") {
        // paid path below
    } else {
        const eff = computeEffectiveAccess({ subject: args.subject, module: args.module });
        if (eff === "free") return { ok: true, paid: false };
    }

    // paid
    if (!args.snapshot.hasUser) {
        return { ok: false, paid: true, reason: "requires_login" };
    }

    const hasAnyPaidEntitlement =
        args.snapshot.isSubscribed ||
        (args.subject?.id ? args.snapshot.subjectAccess.has(args.subject.id) : false) ||
        args.snapshot.moduleAccess.has(args.module.id);

    if (hasAnyPaidEntitlement) return { ok: true, paid: true };

    return { ok: false, paid: true, reason: "requires_payment" };
}