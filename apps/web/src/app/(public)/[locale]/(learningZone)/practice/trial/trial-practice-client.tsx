"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import PracticeShell from "@/components/practice/PracticeShell";
import { usePracticeController } from "@/features/practice/client/usePracticeController";
import { buildTrialHref, startTrialSession } from "@/lib/onboarding/client";

type TrialPracticeClientProps = {
    locale: string;
    sessionId: string | null;
    subject: string | null;
    level: string | null;
    challenge: string | null;
    canonicalPath?: string | null;
};

type GateState = "booting" | "checking" | "recovering" | "ready" | "error";

type PreflightResult = {
    res: Response;
    data: any;
};

const TRIAL_LAST_SESSION_KEY = "zoeskoul.trial.lastSessionId";

function getTrialSessionStorageKey(challenge: string | null) {
    if (!challenge) return TRIAL_LAST_SESSION_KEY;
    return `zoeskoul.trial.challenge:${challenge.slice(-48)}`;
}

function clearStalePracticePointers() {
    if (typeof window === "undefined") return;

    for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i);
        if (!key) continue;

        if (key.startsWith("practice:v6:lastSession:")) {
            window.localStorage.removeItem(key);
        }
    }
}

function getRecoveryStorageKey(
    subject: string | null,
    level: string | null,
    challenge: string | null,
) {
    return challenge
        ? `zoeskoul.trial.recovery:challenge:${challenge.slice(-48)}`
        : `zoeskoul.trial.recovery:${subject ?? "none"}:${level ?? "none"}`;
}

function getRecoveryCount(
    subject: string | null,
    level: string | null,
    challenge: string | null,
) {
    if (typeof window === "undefined") return 0;
    const raw = window.sessionStorage.getItem(
        getRecoveryStorageKey(subject, level, challenge),
    );
    const n = Number(raw ?? "0");
    return Number.isFinite(n) ? n : 0;
}

function setRecoveryCount(
    subject: string | null,
    level: string | null,
    challenge: string | null,
    value: number,
) {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
        getRecoveryStorageKey(subject, level, challenge),
        String(value),
    );
}

function clearRecoveryCount(
    subject: string | null,
    level: string | null,
    challenge: string | null,
) {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(
        getRecoveryStorageKey(subject, level, challenge),
    );
}

function getStoredTrialSessionId(challenge: string | null) {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(
        getTrialSessionStorageKey(challenge),
    );
    const value = String(raw ?? "").trim();
    return value || null;
}

function setStoredTrialSessionId(
    sessionId: string | null | undefined,
    challenge: string | null,
) {
    if (typeof window === "undefined") return;
    const value = String(sessionId ?? "").trim();
    const key = getTrialSessionStorageKey(challenge);

    if (!value) {
        window.sessionStorage.removeItem(key);
        return;
    }

    window.sessionStorage.setItem(key, value);
}

async function preflightTrialSession(sessionId: string): Promise<PreflightResult> {
    const qs = new URLSearchParams({
        sessionId,
        statusOnly: "true",
    });

    const res = await fetch(`/api/practice?${qs.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    return { res, data };
}

async function wait(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyRecoveredSession(sessionId: string) {
    for (let i = 0; i < 5; i++) {
        const { res, data } = await preflightTrialSession(sessionId);

        if (res.ok && data?.code !== "SESSION_RECOVERY_REQUIRED") {
            return true;
        }

        await wait(150);
    }

    return false;
}

function TrialShellInner({ sessionId }: { sessionId: string }) {
    const t = useTranslations("Practice");

    const { shellProps } = usePracticeController({
        sessionId,
        subjectSlug: undefined,
        moduleSlug: undefined,
        isTrial: true,
    });

    return <PracticeShell {...shellProps} t={t} />;
}

function TrialStateCard({
                            title,
                            description,
                            note,
                            primaryAction,
                            secondaryAction,
                        }: {
    title: string;
    description: string;
    note?: string;
    primaryAction?: {
        label: string;
        onClick: () => void | Promise<void>;
        disabled?: boolean;
        variant?: "primary" | "ghost";
    };
    secondaryAction?: {
        label: string;
        onClick: () => void | Promise<void>;
        disabled?: boolean;
        variant?: "primary" | "ghost";
    };
}) {
    return (
        <div className="ui-container py-10">
            <div className="ui-card p-6">
                <h1 className="text-lg font-bold">{title}</h1>

                <p className="mt-2 text-sm text-neutral-600 dark:text-white/70">
                    {description}
                </p>

                {note ? (
                    <p className="mt-2 text-xs text-neutral-500 dark:text-white/50">{note}</p>
                ) : null}

                {primaryAction || secondaryAction ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                        {primaryAction ? (
                            <button
                                type="button"
                                onClick={() => void primaryAction.onClick()}
                                disabled={primaryAction.disabled}
                                className={
                                    primaryAction.variant === "ghost"
                                        ? "ui-btn ui-btn-ghost"
                                        : "ui-btn ui-btn-primary"
                                }
                            >
                                {primaryAction.label}
                            </button>
                        ) : null}

                        {secondaryAction ? (
                            <button
                                type="button"
                                onClick={() => void secondaryAction.onClick()}
                                disabled={secondaryAction.disabled}
                                className={
                                    secondaryAction.variant === "primary"
                                        ? "ui-btn ui-btn-primary"
                                        : "ui-btn ui-btn-ghost"
                                }
                            >
                                {secondaryAction.label}
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export default function TrialPracticeClient({
                                                locale,
                                                sessionId,
                                                subject,
                                                level,
                                                challenge,
                                                canonicalPath = null,
                                            }: TrialPracticeClientProps) {
    const router = useRouter();

    const [storageReady, setStorageReady] = useState(false);
    const [storedSessionId, setStoredSessionIdState] = useState<string | null>(null);

    const [gateState, setGateState] = useState<GateState>("booting");
    const [gateErr, setGateErr] = useState<string | null>(null);

    useEffect(() => {
        const stored = getStoredTrialSessionId(challenge);
        setStoredSessionIdState(stored);
        setStorageReady(true);
    }, [challenge]);

    useEffect(() => {
        if (!sessionId) return;
        setStoredTrialSessionId(sessionId, challenge);
        setStoredSessionIdState(sessionId);
    }, [sessionId, challenge]);

    const effectiveSessionId = sessionId ?? storedSessionId ?? null;

    const missingRecoveryInputs = useMemo(
        () => !challenge && (!subject || !level),
        [subject, level, challenge],
    );

    const goHome = useCallback(() => {
        router.replace(`/${encodeURIComponent(locale)}`);
    }, [router, locale]);

    const startFreshTrial = useCallback(async () => {
        if (!challenge && (!subject || !level)) {
            goHome();
            return;
        }

        try {
            setGateState("recovering");
            setGateErr(null);

            clearStalePracticePointers();
            clearRecoveryCount(subject, level, challenge);

            const out = await startTrialSession(
                challenge
                    ? { challenge, locale }
                    : { subject: subject!, level: level!, locale },
            );

            setStoredTrialSessionId(out.sessionId, challenge);
            setStoredSessionIdState(out.sessionId);

            if (!canonicalPath) {
                router.replace(
                    buildTrialHref({
                        locale,
                        sessionId: out.sessionId,
                        subject,
                        level,
                        status: out.status,
                        completed: out.completed,
                        challenge,
                    }),
                );
            }
        } catch (err) {
            console.error("[trial restart]", err);
            setGateState("error");
            setGateErr("We couldn’t start a new trial right now. Please try again.");
        }
    }, [subject, level, challenge, locale, router, goHome, canonicalPath]);

    useEffect(() => {
        let cancelled = false;

        async function run() {
            if (!storageReady) return;

            if (!effectiveSessionId) {
                if (challenge) {
                    setGateState("recovering");
                    setGateErr(null);
                    clearStalePracticePointers();

                    const out = await startTrialSession({ challenge, locale });
                    if (cancelled) return;

                    setStoredTrialSessionId(out.sessionId, challenge);
                    setStoredSessionIdState(out.sessionId);
                    if (!canonicalPath) {
                        router.replace(
                            buildTrialHref({
                                locale,
                                sessionId: out.sessionId,
                                status: out.status,
                                completed: out.completed,
                                challenge,
                            }),
                        );
                    }
                    return;
                }

                setGateState("error");
                setGateErr("We couldn’t find an active trial session for this page.");
                return;
            }

            setGateState("checking");
            setGateErr(null);

            const { res, data } = await preflightTrialSession(effectiveSessionId);

            if (cancelled) return;

            if (data?.code === "SESSION_RECOVERY_REQUIRED") {
                if (missingRecoveryInputs) {
                    setGateState("error");
                    setGateErr(
                        "Your previous guest trial is no longer available. Please return home and start a new trial.",
                    );
                    return;
                }

                const attempts = getRecoveryCount(subject, level, challenge);

                if (attempts >= 1) {
                    clearStalePracticePointers();
                    setGateState("error");
                    setGateErr(
                        "We could not restore your previous guest trial automatically. Start a new trial to continue.",
                    );
                    return;
                }

                setRecoveryCount(subject, level, challenge, attempts + 1);
                setGateState("recovering");

                clearStalePracticePointers();

                const out = await startTrialSession(
                    challenge
                        ? { challenge, locale }
                        : { subject: subject!, level: level!, locale },
                );

                if (cancelled) return;

                setStoredTrialSessionId(out.sessionId, challenge);
                setStoredSessionIdState(out.sessionId);

                const ok = await verifyRecoveredSession(out.sessionId);

                if (cancelled) return;

                if (!ok) {
                    setGateState("error");
                    setGateErr(
                        "We started a fresh trial, but your browser session is still not ready. Please start a new trial again.",
                    );
                    return;
                }

                clearRecoveryCount(subject, level, challenge);

                if (!canonicalPath) {
                    router.replace(
                        buildTrialHref({
                            locale,
                            sessionId: out.sessionId,
                            subject,
                            level,
                            status: out.status,
                            completed: out.completed,
                            challenge,
                        }),
                    );
                }
                return;
            }

            if (!res.ok) {
                clearRecoveryCount(subject, level, challenge);

                setGateState("error");
                setGateErr(
                    data?.message ??
                    (res.status === 404
                        ? "That trial session is no longer available. Start a new trial to continue."
                        : "We could not open your trial session."),
                );
                return;
            }

            clearRecoveryCount(subject, level, challenge);
            setGateState("ready");
        }

        run().catch((err) => {
            if (cancelled) return;
            console.error("[trial preflight]", err);
            setGateState("error");
            setGateErr("Could not prepare your trial session.");
        });

        return () => {
            cancelled = true;
        };
    }, [storageReady, effectiveSessionId, subject, level, challenge, locale, router, missingRecoveryInputs, canonicalPath]);

    if (!storageReady || gateState === "booting") {
        return (
            <TrialStateCard
                title={challenge ? "Preparing your challenge" : "Preparing your trial"}
                description={
                    challenge
                        ? "Please wait while we open the selected challenge."
                        : "Please wait a moment while we restore your guest session."
                }
            />
        );
    }

    if (
        !effectiveSessionId &&
        gateState !== "checking" &&
        gateState !== "recovering"
    ) {
        return (
            <TrialStateCard
                title={challenge ? "Missing challenge session" : "Missing trial session"}
                description={
                    subject && level
                        ? "We couldn’t find an active trial session for this page. Start a new trial to continue."
                        : "We couldn’t find an active trial session for this page. Please return home and start a new trial."
                }
                note="Guest trials are tied to this browser and guest cookie."
                primaryAction={
                    challenge || (subject && level)
                        ? {
                            label: "Start new trial",
                            onClick: startFreshTrial,
                        }
                        : undefined
                }
                secondaryAction={{
                    label: "Go to home",
                    onClick: goHome,
                    variant: challenge || (subject && level) ? "ghost" : "primary",
                }}
            />
        );
    }

    if (gateState === "checking" || gateState === "recovering") {
        return (
            <TrialStateCard
                title={
                    gateState === "recovering"
                        ? challenge
                            ? "Opening your challenge"
                            : "Restoring your trial"
                        : challenge
                            ? "Preparing your challenge"
                            : "Preparing your trial"
                }
                description={
                    gateState === "recovering"
                        ? challenge
                            ? "We’re opening the selected exercise and preparing your three attempts."
                            : "Your previous guest session is no longer valid, so we’re starting a fresh trial for you."
                        : "Please wait a moment while we check your session."
                }
                note="Guest trials are tied to this browser and guest cookie."
            />
        );
    }

    if (gateState === "error") {
        return (
            <TrialStateCard
                title={challenge ? "Challenge unavailable" : "Trial unavailable"}
                description={gateErr ?? "We could not open your trial session."}
                note="Guest trials are tied to this browser and guest cookie."
                primaryAction={
                    challenge || (subject && level)
                        ? {
                            label: "Start new trial",
                            onClick: startFreshTrial,
                        }
                        : undefined
                }
                secondaryAction={{
                    label: "Go to home",
                    onClick: goHome,
                    variant: challenge || (subject && level) ? "ghost" : "primary",
                }}
            />
        );
    }

    // The gate state should only become ready after a concrete session id has
    // passed preflight. Keep an explicit runtime guard here so the render path
    // remains safe if URL/storage state changes between effects, and so
    // TrialShellInner always receives the non-null string its contract requires.
    if (!effectiveSessionId) {
        return (
            <TrialStateCard
                title={challenge ? "Missing challenge session" : "Missing trial session"}
                description="We couldn’t find an active session for this page. Start a new session to continue."
                note="Guest sessions are tied to this browser and guest cookie."
                primaryAction={
                    challenge || (subject && level)
                        ? {
                            label: challenge ? "Start challenge" : "Start new trial",
                            onClick: startFreshTrial,
                        }
                        : undefined
                }
                secondaryAction={{
                    label: "Go to home",
                    onClick: goHome,
                    variant: challenge || (subject && level) ? "ghost" : "primary",
                }}
            />
        );
    }

    return <TrialShellInner sessionId={effectiveSessionId} />;
}
