"use client";

import FullIDE from "@/components/ide/fullide/FullIDE";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LangRail, LANGS } from "@/components/ide/lang/LangRail";
import { CodeLanguage } from "@/lib/practice/types";
import { cn } from "@/components/ide/utils";
import {useAuthHref} from "@/hooks/useAuthHref";

export type ProgrammingSandboxAccess = {
    hasUser: boolean;
    canUseMultiFile: boolean;
    canSaveCloud: boolean;
    canCreateProjects: boolean;
};

const MIN_PREPARING_MS = 300;

function ProgrammingIdeTransitionCover({ label }: { label: string }) {
    return (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/88 backdrop-blur-sm dark:bg-neutral-950/82">
            <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white/92 p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900/92">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                    Loading
                </div>

                <div className="mt-2 text-sm font-semibold text-neutral-900 dark:text-white/90">
                    Preparing {label}
                </div>

                <div className="mt-4 space-y-2">
                    <div className="h-2.5 w-24 animate-pulse rounded-full bg-neutral-200/85 dark:bg-white/10" />
                    <div className="h-2.5 w-full animate-pulse rounded-full bg-neutral-200/80 dark:bg-white/10" />
                    <div className="h-2.5 w-[82%] animate-pulse rounded-full bg-neutral-200/75 dark:bg-white/10" />
                </div>
            </div>
        </div>
    );
}

export default function ProgrammingIdeSandbox({
                                                  initialLanguage = "python",
                                                  toolSlug = "python",
                                                  title = "Programming IDE",
                                                  routeLanguageMap,
                                                  lessonHref,
                                                  lessonLabel = "Lesson",
                                                  access,
                                              }: {
    initialLanguage?: CodeLanguage;
    toolSlug?: string;
    title?: string;
    routeLanguageMap?: Partial<Record<CodeLanguage, string>>;
    lessonHref?: string;
    lessonLabel?: string;
    access: ProgrammingSandboxAccess;
}) {
    const router = useRouter();

    const [lang, setLang] = useState<CodeLanguage>(initialLanguage);
    const [railCollapsed, setRailCollapsed] = useState(false);
    const [ideReady, setIdeReady] = useState(false);

    const readyTimerRef = useRef<number | null>(null);
    const loadingStartedAtRef = useRef<number>(Date.now());

    const clearReadyTimer = () => {
        if (readyTimerRef.current != null) {
            window.clearTimeout(readyTimerRef.current);
            readyTimerRef.current = null;
        }
    };

    useEffect(() => {
        loadingStartedAtRef.current = Date.now();
        setLang(initialLanguage);
        setIdeReady(false);
    }, [initialLanguage]);

    useEffect(() => {
        const hrefs = Object.values(routeLanguageMap ?? {}).filter(
            (v): v is string => typeof v === "string" && !!v,
        );

        hrefs.forEach((href) => {
            router.prefetch(href);
        });
    }, [router, routeLanguageMap]);

    useEffect(() => {
        return () => clearReadyTimer();
    }, []);

    const active = useMemo(
        () => LANGS.find((x) => x.id === lang) ?? LANGS[0],
        [lang],
    );

    const handleLanguageChange = (next: CodeLanguage) => {
        if (next === lang) return;

        clearReadyTimer();
        loadingStartedAtRef.current = Date.now();
        setIdeReady(false);
        setLang(next);

        const href = routeLanguageMap?.[next];
        if (href) {
            router.push(href);
            return;
        }
    };

    const handleIdeReadyChange = (ready: boolean) => {
        clearReadyTimer();

        if (!ready) {
            loadingStartedAtRef.current = Date.now();
            setIdeReady(false);
            return;
        }

        const elapsed = Date.now() - loadingStartedAtRef.current;
        const remaining = Math.max(0, MIN_PREPARING_MS - elapsed);

        readyTimerRef.current = window.setTimeout(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIdeReady(true);
                });
            });
        }, remaining);
    };

    const storageKey =
        `${process.env.NEXT_PUBLIC_APP_NAME ?? "learnoir"}.ide.workspace.v2.sandbox.programming.${toolSlug}`;
    const authHref = useAuthHref();
    return (
        <div className="h-dvh  w-full min-w-0 overflow-hidden bg-transparent">
            <div className="grid h-full min-h-0 min-w-0 w-full grid-rows-[auto_1fr]">
                <div className="border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-neutral-950/95 lg:hidden">
                    <div className="w-full min-w-0 px-2 py-2">
                        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                            <div className="shrink-0 text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                                IDE
                            </div>

                            <div className="min-w-0 max-w-[45%] truncate text-right text-[11px] font-extrabold text-neutral-500 dark:text-white/50">
                                {active.label}
                            </div>
                        </div>

                        <div className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                            <div className="inline-flex w-[90vw] items-center gap-2 pr-2">
                                {LANGS.map((item) => {
                                    const selected = item.id === lang;

                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => handleLanguageChange(item.id as CodeLanguage)}
                                            aria-pressed={selected}
                                            className={cn(
                                                "shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-extrabold transition-colors",
                                                selected
                                                    ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white/90"
                                                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-950 dark:text-white/75 dark:hover:bg-white/[0.05]",
                                            )}
                                        >
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="min-h-[100vh] min-w-0 lg:flex">
                    <aside
                        className={cn(
                            "hidden h-full min-h-0 shrink-0 overflow-hidden border-r border-neutral-200 bg-white transition-[width] duration-300 ease-in-out dark:border-white/10 dark:bg-neutral-950 lg:block",
                            railCollapsed ? "w-[84px]" : "w-[220px]",
                        )}
                    >
                        <LangRail
                            lang={lang}
                            setLang={handleLanguageChange}
                            collapsed={railCollapsed}
                            onToggleCollapsed={() => setRailCollapsed((v) => !v)}
                        />
                    </aside>

                    <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                        <FullIDE
                            className={cn(
                                "h-full transition-opacity duration-200",
                                ideReady ? "opacity-100" : "opacity-0",
                            )}
                            title={title}
                            fullHeight
                            storageKey={storageKey}
                            language={lang}
                            onChangeLanguage={handleLanguageChange}
                            onReadyChange={handleIdeReadyChange}
                            resetOnForcedLanguageChange={false}
                            showTopLanguageButtons={false}
                            lessonHref={lessonHref}
                            lessonLabel={lessonLabel}
                            access={access}
                            loginHref={authHref}
                            billingHref="/billing"
                            draftStorageMode="local"
                            projectTitle={`${title} Project`}
                        />

                        {!ideReady ? (
                            <ProgrammingIdeTransitionCover label={active.label} />
                        ) : null}
                    </main>
                </div>
            </div>
        </div>
    );
}