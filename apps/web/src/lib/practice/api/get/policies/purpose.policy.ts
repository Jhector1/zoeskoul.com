import type { PurposeMode, PurposePolicy } from "@/lib/subjects/types";
import {
    coercePurposeMode,
    coercePurposePolicy,
} from "@/lib/subjects/quizClient";

export type PracticePurposeDecision =
    | {
    ok: true;
    effective: PurposeMode;
    requested: PurposeMode | null;
    allowed: Array<"quiz" | "project">;
    policy: PurposePolicy;
    source: "assignment" | "param" | "session" | "default";
    reason?: string | null;
}
    | {
    ok: false;
    status: number;
    message: string;
    detail?: any;
};

function pickAllowedPurposesFromSession(session: any): Array<"quiz" | "project"> {
    const p1 = session?.preset?.allowedPurposes;
    if (Array.isArray(p1) && p1.length) {
        return p1.map(String) as Array<"quiz" | "project">;
    }

    const p2 = session?.section?.module?.practicePreset?.allowedPurposes;
    if (Array.isArray(p2) && p2.length) {
        return p2.map(String) as Array<"quiz" | "project">;
    }

    return [];
}

export function computePurposeDecision(args: {
    session: any | null;
    preferPurposeParam?: unknown;
    purposePolicyParam?: unknown;
}): PracticePurposeDecision {
    const { session } = args;
    const allowed = session ? pickAllowedPurposesFromSession(session) : [];
    const policy: PurposePolicy =
        coercePurposePolicy(args.purposePolicyParam) ?? "fallback";

    if (session?.assignmentId) {
        return {
            ok: true,
            effective: "quiz",
            requested: coercePurposeMode(args.preferPurposeParam),
            allowed,
            policy,
            source: "assignment",
            reason: "assignments_ignore_preferPurpose",
        };
    }

    const requested = coercePurposeMode(args.preferPurposeParam);

    const fromSession: PurposeMode =
        String(session?.preferPurpose ?? "quiz") === "project" ? "project" : "quiz";

    const desired: PurposeMode = requested ?? (session ? fromSession : "quiz");
    const allowAll = allowed.length === 0;

    if (policy === "strict" && requested) {
        if (requested === "mixed") {
            const okMixed =
                allowAll || (allowed.includes("quiz") && allowed.includes("project"));

            if (!okMixed) {
                return {
                    ok: false,
                    status: 403,
                    message: "This run does not allow mixed (quiz + project).",
                    detail: { allowed },
                };
            }

            return {
                ok: true,
                effective: "mixed",
                requested,
                allowed,
                policy,
                source: "param",
                reason: null,
            };
        }

        if (!allowAll && !allowed.includes(requested as any)) {
            return {
                ok: false,
                status: 403,
                message: `This run does not allow purpose="${requested}".`,
                detail: { allowed },
            };
        }

        return {
            ok: true,
            effective: requested,
            requested,
            allowed,
            policy,
            source: "param",
            reason: null,
        };
    }

    if (desired === "mixed") {
        const okMixed =
            allowAll || (allowed.includes("quiz") && allowed.includes("project"));

        if (okMixed) {
            return {
                ok: true,
                effective: "mixed",
                requested,
                allowed,
                policy,
                source: requested ? "param" : "default",
            };
        }

        if (allowed.includes("quiz")) {
            return {
                ok: true,
                effective: "quiz",
                requested,
                allowed,
                policy,
                source: requested ? "param" : "default",
                reason: "mixed_not_allowed_fallback_to_quiz",
            };
        }

        if (allowed.includes("project")) {
            return {
                ok: true,
                effective: "project",
                requested,
                allowed,
                policy,
                source: requested ? "param" : "default",
                reason: "mixed_not_allowed_fallback_to_project",
            };
        }

        return {
            ok: true,
            effective: "quiz",
            requested,
            allowed,
            policy,
            source: "default",
            reason: "mixed_fallback_default_quiz",
        };
    }

    if (allowAll || allowed.includes(desired as any)) {
        return {
            ok: true,
            effective: desired,
            requested,
            allowed,
            policy,
            source: requested ? "param" : session ? "session" : "default",
            reason: null,
        };
    }

    if (allowed.includes("quiz")) {
        return {
            ok: true,
            effective: "quiz",
            requested,
            allowed,
            policy,
            source: requested ? "param" : "session",
            reason: "purpose_not_allowed_fallback_to_quiz",
        };
    }

    if (allowed.includes("project")) {
        return {
            ok: true,
            effective: "project",
            requested,
            allowed,
            policy,
            source: requested ? "param" : "session",
            reason: "purpose_not_allowed_fallback_to_project",
        };
    }

    return {
        ok: true,
        effective: "quiz",
        requested,
        allowed,
        policy,
        source: "default",
        reason: "no_allowedPurposes_default_quiz",
    };
}