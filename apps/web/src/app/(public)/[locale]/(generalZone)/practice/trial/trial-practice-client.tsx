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
};

type GateState = "booting" | "checking" | "recovering" | "ready" | "error";

type PreflightResult = {
    res: Response;
    data: any;
};

const TRIAL_LAST_SESSION_KEY = "zoeskoul.trial.lastSessionId";

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

function getRecoveryStorageKey(subject: string | null, level: string | null) {
    return `zoeskoul.trial.recovery:${subject ?? "none"}:${level ?? "none"}`;
}

function getRecoveryCount(subject: string | null, level: string | null) {
    if (typeof window === "undefined") return 0;
    const raw = window.sessionStorage.getItem(getRecoveryStorageKey(subject, level));
    const n = Number(raw ?? "0");
    return Number.isFinite(n) ? n : 0;
}

function setRecoveryCount(subject: string | null, level: string | null, value: number) {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(getRecoveryStorageKey(subject, level), String(value));
}

function clearRecoveryCount(subject: string | null, level: string | null) {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(getRecoveryStorageKey(subject, level));
}

function getStoredTrialSessionId() {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(TRIAL_LAST_SESSION_KEY);
    const value = String(raw ?? "").trim();
    return value || null;
}

function setStoredTrialSessionId(sessionId: string | null | undefined) {
    if (typeof window === "undefined") return;
    const value = String(sessionId ?? "").trim();

    if (!value) {
        window.sessionStorage.removeItem(TRIAL_LAST_SESSION_KEY);
        return;
    }

    window.sessionStorage.setItem(TRIAL_LAST_SESSION_KEY, value);
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
                                            }: TrialPracticeClientProps) {
    const router = useRouter();

    const [storageReady, setStorageReady] = useState(false);
    const [storedSessionId, setStoredSessionIdState] = useState<string | null>(null);

    const [gateState, setGateState] = useState<GateState>("booting");
    const [gateErr, setGateErr] = useState<string | null>(null);

    useEffect(() => {
        const stored = getStoredTrialSessionId();
        setStoredSessionIdState(stored);
        setStorageReady(true);
    }, []);

    useEffect(() => {
        if (!sessionId) return;
        setStoredTrialSessionId(sessionId);
        setStoredSessionIdState(sessionId);
    }, [sessionId]);

    const effectiveSessionId = sessionId ?? storedSessionId ?? null;

    const missingRecoveryInputs = useMemo(
        () => !subject || !level,
        [subject, level],
    );

    const goHome = useCallback(() => {
        router.replace(`/${encodeURIComponent(locale)}`);
    }, [router, locale]);

    const startFreshTrial = useCallback(async () => {
        if (!subject || !level) {
            goHome();
            return;
        }

        try {
            setGateState("recovering");
            setGateErr(null);

            clearStalePracticePointers();
            clearRecoveryCount(subject, level);

            const out = await startTrialSession({
                subject,
                level,
                locale,
            });

            setStoredTrialSessionId(out.sessionId);
            setStoredSessionIdState(out.sessionId);

            router.replace(
                buildTrialHref({
                    locale,
                    sessionId: out.sessionId,
                    subject,
                    level,
                    status: out.status,
                    completed: out.completed,
                }),
            );
        } catch (err) {
            console.error("[trial restart]", err);
            setGateState("error");
            setGateErr("We couldn’t start a new trial right now. Please try again.");
        }
    }, [subject, level, locale, router, goHome]);

    useEffect(() => {
        let cancelled = false;

        async function run() {
            if (!storageReady) return;

            if (!effectiveSessionId) {
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

                const attempts = getRecoveryCount(subject, level);

                if (attempts >= 1) {
                    clearStalePracticePointers();
                    setGateState("error");
                    setGateErr(
                        "We could not restore your previous guest trial automatically. Start a new trial to continue.",
                    );
                    return;
                }

                setRecoveryCount(subject, level, attempts + 1);
                setGateState("recovering");

                clearStalePracticePointers();

                const out = await startTrialSession({
                    subject: subject!,
                    level: level!,
                    locale,
                });

                if (cancelled) return;

                setStoredTrialSessionId(out.sessionId);
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

                clearRecoveryCount(subject, level);

                router.replace(
                    buildTrialHref({
                        locale,
                        sessionId: out.sessionId,
                        subject,
                        level,
                        status: out.status,
                        completed: out.completed,
                    }),
                );
                return;
            }

            if (!res.ok) {
                clearRecoveryCount(subject, level);

                setGateState("error");
                setGateErr(
                    data?.message ??
                    (res.status === 404
                        ? "That trial session is no longer available. Start a new trial to continue."
                        : "We could not open your trial session."),
                );
                return;
            }

            clearRecoveryCount(subject, level);
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
    }, [storageReady, effectiveSessionId, subject, level, locale, router, missingRecoveryInputs]);

    if (!storageReady || gateState === "booting") {
        return (
            <TrialStateCard
                title="Preparing your trial"
                description="Please wait a moment while we restore your guest session."
            />
        );
    }

    if (!effectiveSessionId) {
        return (
            <TrialStateCard
                title="Missing trial session"
                description={
                    subject && level
                        ? "We couldn’t find an active trial session for this page. Start a new trial to continue."
                        : "We couldn’t find an active trial session for this page. Please return home and start a new trial."
                }
                note="Guest trials are tied to this browser and guest cookie."
                primaryAction={
                    subject && level
                        ? {
                            label: "Start new trial",
                            onClick: startFreshTrial,
                        }
                        : undefined
                }
                secondaryAction={{
                    label: "Go to home",
                    onClick: goHome,
                    variant: subject && level ? "ghost" : "primary",
                }}
            />
        );
    }

    if (gateState === "checking" || gateState === "recovering") {
        return (
            <TrialStateCard
                title={gateState === "recovering" ? "Restoring your trial" : "Preparing your trial"}
                description={
                    gateState === "recovering"
                        ? "Your previous guest session is no longer valid, so we’re starting a fresh trial for you."
                        : "Please wait a moment while we check your session."
                }
                note="Guest trials are tied to this browser and guest cookie."
            />
        );
    }

    if (gateState === "error") {
        return (
            <TrialStateCard
                title="Trial unavailable"
                description={gateErr ?? "We could not open your trial session."}
                note="Guest trials are tied to this browser and guest cookie."
                primaryAction={
                    subject && level
                        ? {
                            label: "Start new trial",
                            onClick: startFreshTrial,
                        }
                        : undefined
                }
                secondaryAction={{
                    label: "Go to home",
                    onClick: goHome,
                    variant: subject && level ? "ghost" : "primary",
                }}
            />
        );
    }

    return <TrialShellInner sessionId={effectiveSessionId} />;
}
