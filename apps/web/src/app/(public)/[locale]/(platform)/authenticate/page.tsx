"use client";

import React, { useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";

type AuthProvider = {
    id: string;
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

function friendlyAuthError(code: string | null, t: (key: string) => string) {
    if (!code) return null;

    try {
        return t(`errors.${code}`);
    } catch {
        return t("errors.Default");
    }
}

export default function AuthenticatePage() {
    const t = useTranslations("auth");
    const locale = useLocale();
    const sp = useSearchParams();

    const fallback = `/${locale}`;
    const rawCallbackUrl = sp.get("callbackUrl");
    const rawError = sp.get("error");

    const callbackUrl = useMemo(
        () =>
            sanitizeCallbackUrl(rawCallbackUrl, {
                locale,
                fallback,
            }),
        [rawCallbackUrl, locale, fallback],
    );

    const errorText = useMemo(
        () => friendlyAuthError(rawError, t),
        [rawError, t],
    );

    const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

    function onProvider(providerId: string) {
        if (loadingProvider) return;
        setLoadingProvider(providerId);
        void signIn(providerId, { callbackUrl });
    }

    const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Learnoir";

    return (
        <main className="relative min-h-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-[#070A12] dark:text-white">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-24 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="absolute -bottom-24 right-[-80px] h-[420px] w-[420px] rounded-full bg-indigo-500/10 blur-3xl" />
                <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_20%_0%,rgba(16,185,129,0.10)_0%,rgba(245,245,245,1)_60%)] dark:bg-[radial-gradient(1200px_700px_at_20%_0%,rgba(55,65,81,0.35)_0%,rgba(7,10,18,1)_55%)]" />
            </div>

            <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center p-6">
                <div className="w-full max-w-md">
                    <div className="mb-6 flex items-center justify-center gap-3">
                        <div className="ui-icon-box">
                            <KeycloakIcon className="h-5 w-5 opacity-90" />
                        </div>

                        <div className="min-w-0 leading-tight">
                            <div className="ui-title-sm">
                                {t("brand.name", { appName })}
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
                                            onClick={() => onProvider(provider.id)}
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
                            <Spinner className="h-4 w-4 shrink-0" />
                        ) : (
                            <Icon className="h-4 w-4 shrink-0 opacity-90" />
                        )}

                          <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {isLoading
                                ? t("status.redirecting")
                                : t(provider.labelKey)}
                          </span>

                              {provider.noteKey ? (
                                  <span className="ui-meta mt-0.5 block truncate">
                              {t(provider.noteKey)}
                            </span>
                              ) : null}
                        </span>
                      </span>

                                            <span className="ui-meta-strong">→</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <p className="ui-meta mt-4">{t("notes.redirect")}</p>

                            <div className="mt-6 border-t border-[rgb(var(--ui-border)/0.72)] pt-4 text-[11px] leading-relaxed">
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
                        {t("notes.trouble")} {t("notes.support")}
                    </div>
                </div>
            </div>
        </main>
    );
}

function Spinner({ className = "" }: { className?: string }) {
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

function KeycloakIcon({ className = "" }: { className?: string }) {
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

function GoogleIcon({ className = "" }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M12 10.2v3.8h5.3c-.2 1.2-1.4 3.5-5.3 3.5A6 6 0 1 1 12 6c1.7 0 2.9.7 3.6 1.3l2.4-2.3C16.5 3.6 14.5 2.6 12 2.6 6.9 2.6 2.8 6.7 2.8 11.8S6.9 21 12 21c6.2 0 8.4-4.3 8.4-6.6 0-.4-.05-.7-.1-1H12Z"
                opacity="0.9"
            />
        </svg>
    );
}