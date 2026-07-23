import { computeEffectiveAccess, type ModuleAccessConfig, type SubjectAccessConfig } from "./accessTypes";
import type { AccessSnapshot } from "./accessSnapshot";

export type ModuleAccessDecision =
    | { ok: true; paid: boolean }
    | {
    ok: false;
    paid: boolean;
    reason: "requires_login" | "requires_payment" | "requires_assignment";
};

export function resolveModuleAccess(args: {
    subject: SubjectAccessConfig | null;
    module: ModuleAccessConfig;
    snapshot: AccessSnapshot;
    requireAll?: boolean;
}): ModuleAccessDecision {
    const visibility = args.subject?.visibility ?? "public";
    const subjectIsRestricted = visibility !== "public";

    if (subjectIsRestricted) {
        if (!args.snapshot.hasUser) {
            return { ok: false, paid: false, reason: "requires_login" };
        }

        const hasAudienceAccess = Boolean(
            args.subject?.id && args.snapshot.subjectAccess.has(args.subject.id),
        );

        if (!hasAudienceAccess) {
            return { ok: false, paid: false, reason: "requires_assignment" };
        }
    }

    const requireAll = Boolean(args.requireAll);

    if (!requireAll || args.module.accessOverride === "free") {
        const effective = computeEffectiveAccess({
            subject: args.subject,
            module: args.module,
        });
        if (effective === "free") return { ok: true, paid: false };
    }

    if (!args.snapshot.hasUser) {
        return { ok: false, paid: true, reason: "requires_login" };
    }

    const hasPaidEntitlement =
        args.snapshot.isSubscribed ||
        (args.subject?.id ? args.snapshot.subjectAccess.has(args.subject.id) : false) ||
        args.snapshot.moduleAccess.has(args.module.id);

    if (hasPaidEntitlement) return { ok: true, paid: true };

    return { ok: false, paid: true, reason: "requires_payment" };
}
