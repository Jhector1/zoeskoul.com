import type { PurposeMode, PurposePolicy } from "@zoeskoul/curriculum-contracts/subjects/types";
import {
    coercePurposeMode,
    coercePurposePolicy,
} from "@zoeskoul/curriculum-contracts/subjects/quizClient";
import { resolvePracticeExperienceMode } from "@/lib/practice/experience/resolve";
import { readSubscriberPracticeMeta } from "@/lib/practice/experience/subscriberPractice";

type AtomicPracticePurpose = Exclude<PurposeMode, "mixed">;

export type PracticePurposeDecision =
    | {
    ok: true;
    effective: PurposeMode;
    requested: PurposeMode | null;
    allowed: AtomicPracticePurpose[];
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

function normalizeAllowedPurposes(value: unknown): AtomicPracticePurpose[] {
    if (!Array.isArray(value)) return [];

    return Array.from(
        new Set(
            value
                .map((item) => coercePurposeMode(item))
                .filter(
                    (item): item is AtomicPracticePurpose =>
                        item === "quiz" ||
                        item === "project" ||
                        item === "practice",
                ),
        ),
    );
}

function pickAllowedPurposesFromSession(session: any): AtomicPracticePurpose[] {
    const experienceMode = resolvePracticeExperienceMode(session);
    const subscriberPractice = readSubscriberPracticeMeta(session?.meta);

    if (experienceMode === "standard" && subscriberPractice) {
        return normalizeAllowedPurposes(
            subscriberPractice.queue.map((target) => target.exercisePurpose),
        );
    }

    if (experienceMode === "daily_five") {
        return ["practice"];
    }

    if (experienceMode === "standard" || experienceMode === "practice") {
        return ["practice"];
    }

    const p1 = normalizeAllowedPurposes(session?.preset?.allowedPurposes);
    if (p1.length) return p1;

    const p2 = normalizeAllowedPurposes(
        session?.section?.module?.practicePreset?.allowedPurposes,
    );
    if (p2.length) return p2;

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

    const experienceMode = resolvePracticeExperienceMode(session);

    if (experienceMode === "assignment") {
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

    if (experienceMode === "onboarding_trial") {
        return {
            ok: true,
            effective: "quiz",
            requested: coercePurposeMode(args.preferPurposeParam),
            allowed: ["quiz"],
            policy: "strict",
            source: "session",
            reason: "onboarding_trial_uses_quiz_purpose",
        };
    }

    const subscriberPractice = readSubscriberPracticeMeta(session?.meta);
    if (experienceMode === "standard" && subscriberPractice) {
        const requested = coercePurposeMode(args.preferPurposeParam);
        const requestedAtomic =
            requested && requested !== "mixed" ? requested : null;
        const effective =
            requestedAtomic && allowed.includes(requestedAtomic)
                ? requestedAtomic
                : allowed[0] ?? "practice";

        return {
            ok: true,
            effective,
            requested,
            allowed,
            policy: "strict",
            source: requestedAtomic ? "param" : "session",
            reason: "subscriber_practice_uses_authored_queue_purpose",
        };
    }

    if (experienceMode === "daily_five") {
        return {
            ok: true,
            effective: "practice",
            requested: coercePurposeMode(args.preferPurposeParam),
            allowed: ["practice"],
            policy: "strict",
            source: session ? "session" : "default",
            reason: "daily_practice_uses_practice_purpose",
        };
    }

    if (experienceMode === "standard" || experienceMode === "practice") {
        return {
            ok: true,
            effective: "practice",
            requested: coercePurposeMode(args.preferPurposeParam),
            allowed: ["practice"],
            policy: "strict",
            source: session ? "session" : "default",
            reason: "practice_modes_use_practice_purpose",
        };
    }

    const requested = coercePurposeMode(args.preferPurposeParam);
    const sessionPurpose = coercePurposeMode(session?.preferPurpose);
    const fromSession: AtomicPracticePurpose =
        sessionPurpose && sessionPurpose !== "mixed" ? sessionPurpose : "quiz";

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

        if (!allowAll && !allowed.includes(requested)) {
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

        if (allowed.includes("practice")) {
            return {
                ok: true,
                effective: "practice",
                requested,
                allowed,
                policy,
                source: requested ? "param" : "default",
                reason: "mixed_not_allowed_fallback_to_practice",
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

    if (allowAll || allowed.includes(desired)) {
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

    if (allowed.includes("practice")) {
        return {
            ok: true,
            effective: "practice",
            requested,
            allowed,
            policy,
            source: requested ? "param" : "session",
            reason: "purpose_not_allowed_fallback_to_practice",
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
