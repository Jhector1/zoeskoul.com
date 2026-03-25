// src/lib/access/accessTypes.ts
export type AccessPolicy = "free" | "paid";
export type AccessOverride = "inherit" | "free" | "paid";

export type SubjectAccessConfig = {
    slug: string;
    id: string;
    accessPolicy: AccessPolicy;
    entitlementKey?: string | null;
};

export type ModuleAccessConfig = {
    slug: string;
    id: string;
    accessOverride: AccessOverride;
    entitlementKey?: string | null;
};

export type EffectiveAccess = "free" | "paid";

export function computeEffectiveAccess(args: {
    subject: SubjectAccessConfig | null;
    module: ModuleAccessConfig;
}): EffectiveAccess {
    const { subject, module } = args;

    // module override always wins
    if (module.accessOverride === "free") return "free";
    if (module.accessOverride === "paid") return "paid";

    // inherit from subject
    if (!subject) return "free";
    return subject.accessPolicy === "paid" ? "paid" : "free";
}