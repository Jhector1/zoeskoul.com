"use client";

import React, {useMemo, useState} from "react";
import {signIn} from "next-auth/react";
import {useSearchParams} from "next/navigation";
import {useLocale, useTranslations} from "next-intl";
import Link from "next/link";

function safeCallbackUrl(raw: string | null | undefined, fallback: string) {
    const v = String(raw ?? "").trim();
    if (!v.startsWith("/")) return fallback;
    if (v.startsWith("//")) return fallback;
    if (v.includes("://")) return fallback;
    return v;
}

function friendlyAuthError(code: string | null, t: (key: string) => string) {
    if (!code) return null;
    const key = `errors.${code}`;
    // next-intl has `t.has()` in newer versions; this works everywhere:
    try {
        return t(key);
    } catch {
        return t("errors.Default");
    }
}

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

export default function AuthenticatePage() {
    const t = useTranslations("auth");
    const locale = useLocale();
    const sp = useSearchParams();

    const fallback = `/${locale}`;
    const callbackUrl = safeCallbackUrl(sp.get("callbackUrl"), fallback);

    const errorText = useMemo(
        () => friendlyAuthError(sp.get("error"), t),
        [sp, t]
    );

    const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

    const onProvider = (providerId: string) => {
        if (loadingProvider) return;
        setLoadingProvider(providerId);
        void signIn(providerId, {callbackUrl});
    };
    const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Learnoir";

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
                        <div
                            className="grid h-10 w-10 place-items-center rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
                            <KeycloakIcon className="h-5 w-5 opacity-90"/>
                        </div>
                        <div className="leading-tight text-left">
                            <div className="text-sm font-semibold tracking-wide">
                                {t("brand.name", {appName})}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-white/50">
                                {t("brand.tagline")}
                            </div>
                        </div>
                    </div>

                    <div className="ui-card overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.12)] dark:shadow-none">
                        <div
                            className="border-b border-neutral-200 bg-white/70 p-6 backdrop-blur-xl dark:border-white/10 dark:bg-black/20">
                            <h1 className="text-xl font-black tracking-tight">{t("card.title")}</h1>
                            <p className="mt-1 text-sm text-neutral-600 dark:text-white/70">
                                {t("card.subtitle")}
                            </p>
                        </div>

                        <div className="p-6">
                            {errorText && (
                                <div
                                    className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-100">
                                    <div className="font-extrabold">{t("errors.title")}</div>
                                    <div className="mt-1 text-rose-900/80 dark:text-rose-100/80">
                                        {errorText}
                                    </div>
                                </div>
                            )}

                            <div className="grid gap-3">
                                {PROVIDERS.map((p) => {
                                    const isLoading = loadingProvider === p.id;
                                    const Icon = p.icon;

                                    const base =
                                        "ui-btn w-full py-3 justify-between gap-3 disabled:opacity-60 disabled:cursor-not-allowed";
                                    const variant =
                                        p.variant === "primary" ? "ui-btn-primary" : "ui-btn-secondary";

                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => onProvider(p.id)}
                                            disabled={!!loadingProvider}
                                            className={`${base} ${variant}`}
                                        >
                      <span className="flex flex-nowrap items-center gap-2">
                        {isLoading ? (
                            <Spinner className="h-4 w-4"/>
                        ) : (
                            <Icon className="h-4 w-4 opacity-90"/>
                        )}
                          <span className="text-left flex items-center gap-x-4 flex-nowrap leading-tight">
                          <span className="block text-sm font-extrabold">
                            {isLoading ? t("status.redirecting") : t(p.labelKey)}
                          </span>

                            {/*  {p.noteKey ? (*/}
                            {/*      <span className="ui-home-pill mt-1 inline-flex">*/}
                            {/*  {t(p.noteKey)}*/}
                            {/*</span>*/}
                            {/*  ) : null}*/}
                        </span>
                      </span>

                                            <span className="text-neutral-700/60 dark:text-white/60">→</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-4 text-xs text-neutral-500 dark:text-white/50">
                                {t("notes.redirect")}
                            </div>

                            <div
                                className="mt-6 border-t border-neutral-200 pt-4 text-[11px] leading-relaxed text-neutral-500 dark:border-white/10 dark:text-white/40">
                                {t("legal.prefix")}{" "}
                                <Link href={"/legal/terms"} className="text-neutral-800 dark:text-white/70">{t("legal.terms")}</Link>{" "}
                                {t("legal.and")}{" "}
                                <Link href={'/legal/privacy'} className="text-neutral-800 dark:text-white/70">{t("legal.privacy")}</Link>.
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 text-center text-xs text-neutral-500 dark:text-white/35">
                        {t("notes.trouble")} {t("notes.support")}
                    </div>
                </div>
            </div>
        </main>
    );
}

function Spinner({className = ""}: { className?: string }) {
    return (
        <svg className={["animate-spin", className].join(" ")} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
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
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M12 10.2v3.8h5.3c-.2 1.2-1.4 3.5-5.3 3.5A6 6 0 1 1 12 6c1.7 0 2.9.7 3.6 1.3l2.4-2.3C16.5 3.6 14.5 2.6 12 2.6 6.9 2.6 2.8 6.7 2.8 11.8S6.9 21 12 21c6.2 0 8.4-4.3 8.4-6.6 0-.4-.05-.7-.1-1H12Z"
                opacity="0.9"
            />
        </svg>
    );
}