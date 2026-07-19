import type { SaveOnboardingInput } from "@/lib/onboarding/schema";

export async function saveOnboarding(input: SaveOnboardingInput) {
    const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
    });

    if (!res.ok) throw new Error("Failed to save onboarding.");
    return res.json();
}

export async function claimGuestOnboarding() {
    const res = await fetch("/api/onboarding/claim", {
        method: "POST",
        credentials: "include",
    });

    if (!res.ok) throw new Error("Failed to claim guest onboarding.");
    return res.json();
}





export type StartTrialSessionResponse = {
    ok: true;
    resumed: boolean;
    completed: boolean;
    status: "active" | "completed";
    sessionId: string;
    requestId: string;
};

export async function startTrialSession(input: {
    subject?: string;
    level?: string;
    locale?: string;
    challenge?: string;
}) {
    const endpoint = input.challenge
        ? "/api/practice/challenge/start"
        : "/api/practice/trial/start";
    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(input),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
        throw new Error(data?.message ?? "Failed to start trial session.");
    }

    return data as StartTrialSessionResponse;
}

export function buildTrialReturnUrl(args: {
    locale: string;
    subject?: string | null;
}) {
    const { locale, subject } = args;

    if (subject) return `/${encodeURIComponent(locale)}/subjects/${encodeURIComponent(subject)}/modules`;

    return `/${encodeURIComponent(locale)}/subjects`;
}
export function buildTrialHref(args: {
    locale: string;
    sessionId: string;
    subject?: string | null;
    level?: string | null;
    status?: "active" | "completed";
    completed?: boolean;
    challenge?: string | null;
}) {
    const qs = new URLSearchParams();

    const returnTo = buildTrialReturnUrl({
        locale: args.locale,
        subject: args.subject,
    });

    qs.set("sessionId", args.sessionId);
    qs.set("returnTo", returnTo);

    if (args.subject) qs.set("subject", args.subject);
    if (args.level) qs.set("level", args.level);
    if (args.status) qs.set("status", args.status);
    if (args.challenge) qs.set("challenge", args.challenge);

    if (typeof args.completed === "boolean") {
        qs.set("completed", args.completed ? "1" : "0");
    }

    return `/${encodeURIComponent(args.locale)}/practice/trial?${qs.toString()}`;
}