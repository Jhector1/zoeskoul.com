"use client";

import React, {useMemo, useState} from "react";
import {useSearchParams} from "next/navigation";
import {useLocale, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@zoeskoul/learner-ui/lib/cn";
import {resolveRequestedAuthCallback} from "@/lib/auth/resolveAuthRedirect";
import {
    type AuthProviderId,
    signInWithProvider,
} from "@/lib/auth/signInWithProvider";

type AuthProvider = {
    id: AuthProviderId;
    labelKey: string;
    noteKey?: string;
    icon: React.FC<{ className?: string }>;
    variant: "primary" | "secondary";
};

const PROVIDERS: AuthProvider[] = [
    {
        id: "keycloak",
        labelKey: "providers.sso",
        noteKey: "providers.recommended",
        icon: KeycloakIcon,
        variant: "primary",
    },
    {
        id: "google",
        labelKey: "providers.google",
        icon: GoogleIcon,
        variant: "secondary",
    },
];

const KNOWN_AUTH_ERROR_CODES = new Set([
    "OAuthSignin",
    "OAuthCallback",
    "OAuthAccountNotLinked",
    "CredentialsSignin",
    "SessionRequired",
    "Configuration",
]);

function friendlyAuthError(code: string | null, t: (key: string) => string) {
    if (!code) return null;

    const safeCode = KNOWN_AUTH_ERROR_CODES.has(code)
        ? code
        : "Default";

    return t(`errors.${safeCode}`);
}

export default function AuthenticatePage() {
    const t = useTranslations("auth");
    const locale = useLocale();
    const sp = useSearchParams();

    const rawCallbackUrl = sp.get("callbackUrl");
    const rawError = sp.get("error");
    const accessReason = sp.get("reason");
    const accessResource = (sp.get("resource") ?? "").slice(0, 180);

    const callbackUrl = useMemo(
        () =>
            resolveRequestedAuthCallback({
                rawCallbackUrl,
                locale,
                includeLocalApps: process.env.NODE_ENV !== "production",
            }),
        [rawCallbackUrl, locale],
    );

    const errorText = useMemo(
        () => friendlyAuthError(rawError, t),
        [rawError, t],
    );

    const accessContext = useMemo(() => {
        if (accessReason === "school_staff_invite") {
            return { title: t("schoolStaffInviteContext.title"), body: t("schoolStaffInviteContext.body", { resource: accessResource || t("schoolStaffInviteContext.fallbackResource") }) };
        }

if (accessReason === "class_invite") {
    return {
        title: t("classInviteContext.title"),
        body: t("classInviteContext.body", {
            resource:
                accessResource ||
                t("classInviteContext.fallbackResource"),
        }),
    };
}
        if (accessReason === "course_invite") {
            return {
                title: t("context.courseInvite.title"),
                body: t("context.courseInvite.body", {
                    resource: accessResource || t("context.courseInvite.fallbackResource"),
                }),
            };
        }
        if (accessReason === "payment_required") {
            return {
                title: t("context.paymentRequired.title"),
                body: t("context.paymentRequired.body"),
            };
        }
        if (accessReason === "private_course") {
            return {
                title: t("context.privateCourse.title"),
                body: t("context.privateCourse.body"),
            };
        }
        if (accessReason === "tutoring_invite") {
            return {
                title: t("context.tutoringInvite.title"),
                body: t("context.tutoringInvite.body"),
            };
        }
        if (accessReason === "tutoring_session") {
            return {
                title: t("context.tutoringSession.title"),
                body: t("context.tutoringSession.body"),
            };
        }
        return null;
    }, [accessReason, accessResource, t]);

    const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

    async function onProvider(providerId: AuthProviderId) {
        if (loadingProvider) return;
        setLoadingProvider(providerId);

        try {
            await signInWithProvider(providerId, callbackUrl);
        } catch {
            setLoadingProvider(null);
        }
    }

    const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "ZoeSkoul";

    return (
        <main
            className="relative min-h-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-[#070A12] dark:text-white">
            <div className="pointer-events-none absolute inset-0">
                <div
                    className="absolute -top-24 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl"/>
                <div
                    className="absolute -bottom-24 right-[-80px] h-[420px] w-[420px] rounded-full bg-indigo-500/10 blur-3xl"/>
                <div
                    className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_20%_0%,rgba(16,185,129,0.10)_0%,rgba(245,245,245,1)_60%)] dark:bg-[radial-gradient(1200px_700px_at_20%_0%,rgba(55,65,81,0.35)_0%,rgba(7,10,18,1)_55%)]"/>
            </div>

            <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center p-6">
                <div className="w-full max-w-md">
                    <div className="mb-6 flex items-center justify-center gap-3">
                        <div className="ui-icon-box">
                            <KeycloakIcon className="h-5 w-5 opacity-90"/>
                        </div>

                        <div className="min-w-0 leading-tight">
                            <div className="ui-title-sm">
                                {t("brand.name", {appName})}
                            </div>
                            <div className="ui-meta">
                                {t("brand.tagline")}
                            </div>
                        </div>
                    </div>

                    <section className="ui-page-surface overflow-hidden">
                        <div className="border-b border-[rgb(var(--ui-border)/0.72)] p-6">
                            <div className="ui-kicker">{t("card.eyebrow")}</div>
                            <h1 className="ui-title-md mt-2">{t("card.title")}</h1>
                            <p className="ui-meta mt-1">{t("card.subtitle")}</p>
                        </div>

                        <div className="p-6">
                            {accessContext ? (
                                <div className="ui-surface-warn mb-4 p-4">
                                    <div className="ui-title-sm">{accessContext.title}</div>
                                    <div className="ui-meta mt-1">{accessContext.body}</div>
                                </div>
                            ) : null}

                            {errorText ? (
                                <div className="ui-surface-danger mb-4 p-4">
                                    <div className="ui-title-sm">{t("errors.title")}</div>
                                    <div className="ui-meta mt-1 text-[rgb(var(--ui-danger)/1)]">
                                        {errorText}
                                    </div>
                                </div>
                            ) : null}

                            <div className="grid gap-3">
                                {PROVIDERS.map((provider) => {
                                    const isLoading = loadingProvider === provider.id;
                                    const Icon = provider.icon;

                                    return (
                                        <button
                                            key={provider.id}
                                            type="button"
                                            onClick={() => void onProvider(provider.id)}
                                            disabled={!!loadingProvider}
                                            className={cn(
                                                provider.variant === "primary"
                                                    ? "ui-btn-primary"
                                                    : "ui-btn-secondary",
                                                "flex h-11 w-full items-center justify-between gap-3 px-4 text-left disabled:cursor-not-allowed disabled:opacity-60",
                                            )}
                                        >
                      <span className="flex min-w-0 items-center gap-3">
                        {isLoading ? (
                            <Spinner className="h-4 w-4 shrink-0"/>
                        ) : (
                            <Icon className="h-4 w-4 shrink-0 opacity-90"/>
                        )}

                          <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {isLoading
                                ? t("status.redirecting")
                                : t(provider.labelKey)}
                          </span>

                              {provider.noteKey ? (
                                  <span
                                      className={cn(
                                          "mt-0.5 block truncate text-[11px] font-semibold",
                                          provider.variant === "primary"
                                              ? "text-[rgb(var(--ui-text-invert)/0.82)]"
                                              : "text-[rgb(var(--ui-text-muted)/0.96)]",
                                      )}
                                  >
                              {t(provider.noteKey)}
                            </span>
                              ) : null}
                        </span>
                      </span>

                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    "shrink-0 text-base font-bold leading-none",
                                                    provider.variant === "primary"
                                                        ? "text-[rgb(var(--ui-text-invert)/0.92)]"
                                                        : "text-[rgb(var(--ui-text)/0.9)]",
                                                )}
                                            >
                                                →
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <p className="ui-meta mt-4">{t("notes.redirect")}</p>

                            <div
                                className="mt-6 border-t border-[rgb(var(--ui-border)/0.72)] pt-4 text-[11px] leading-relaxed">
                                <span className="ui-meta">{t("legal.prefix")} </span>
                                <Link href="/legal/terms" className="ui-meta-strong hover:underline">
                                    {t("legal.terms")}
                                </Link>
                                <span className="ui-meta"> {t("legal.and")} </span>
                                <Link href="/legal/privacy" className="ui-meta-strong hover:underline">
                                    {t("legal.privacy")}
                                </Link>
                                <span className="ui-meta">.</span>
                            </div>
                        </div>
                    </section>

                    <div className="ui-meta mt-6 text-center">
                        {t("notes.trouble")} <Link href={"/contact"}>{t("notes.support")}</Link>
                    </div>
                </div>
            </div>
        </main>
    );
}

function Spinner({className = ""}: { className?: string }) {
    return (
        <svg
            className={cn("animate-spin", className)}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M12 3a9 9 0 1 0 9 9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function KeycloakIcon({className = ""}: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M12 2.75c2.6 2.1 5.3 2.9 8 3.35v6.3c0 4.8-3.2 8.8-8 9.9-4.8-1.1-8-5.1-8-9.9V6.1c2.7-.45 5.4-1.25 8-3.35Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
            <path
                d="M9.2 12.2 11 14l4-4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function GoogleIcon({className = ""}: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 18 18"
            role="img"
            aria-label="Google"
        >
            <path
                fill="#4285F4"
                d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.703-1.568 2.684-3.878 2.684-6.614Z"
            />
            <path
                fill="#34A853"
                d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"
            />
            <path
                fill="#FBBC05"
                d="M3.963 10.706A5.42 5.42 0 0 1 3.682 9c0-.592.102-1.168.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.45.347 2.823.956 4.038l3.007-2.332Z"
            />
            <path
                fill="#EA4335"
                d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"
            />
        </svg>
    );
}
