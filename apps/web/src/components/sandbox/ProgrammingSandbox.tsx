"use client";

import FullIDE from "@/components/ide/fullide/FullIDE";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { LangRail, LANGS } from "@/components/ide/lang/LangRail";
import { CodeLanguage } from "@/lib/practice/types";
import { cn } from "@/components/ide/utils";
import { useAuthHref } from "@/hooks/useAuthHref";
import BashTerminal from "@/components/code/runner/components/BashTerminal";

export type ProgrammingSandboxAccess = {
    hasUser: boolean;
    canUseMultiFile: boolean;
    canSaveCloud: boolean;
    canCreateProjects: boolean;
};

type SurfaceMode = "code" | "shell";

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

function SurfaceModeSwitch(props: {
    mode: SurfaceMode;
    shellRequiresLogin: boolean;
    onModeChange: (next: SurfaceMode) => void;
}) {
    const { mode, shellRequiresLogin, onModeChange } = props;

    return (
        <div className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-1 dark:border-white/10 dark:bg-neutral-950">
            <button
                type="button"
                onClick={() => onModeChange("code")}
                className={cn(
                    "rounded-md px-2 py-1 text-xs font-extrabold transition-colors",
                    mode === "code"
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-white/70 dark:hover:bg-white/[0.06]",
                )}
            >
                Code
            </button>

            <button
                type="button"
                onClick={() => onModeChange("shell")}
                className={cn(
                    "rounded-md px-2 py-1.5 text-xs font-extrabold transition-colors",
                    mode === "shell"
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-white/70 dark:hover:bg-white/[0.06]",
                )}
                title={shellRequiresLogin ? "Sign in required" : "Open shell practice"}
            >
                Shell
                {shellRequiresLogin ? (
                    <span className="ml-2 rounded-full border border-neutral-300 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-neutral-500 dark:border-white/15 dark:text-white/45">
                        Login
                    </span>
                ) : null}
            </button>
        </div>
    );
}

function ShellLoginWall(props: {
    onLogin: () => void;
}) {
    const { onLogin } = props;

    return (
        <div className="flex h-full items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                    Shell Practice
                </div>

                <div className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white/90">
                    Sign in to use the shell
                </div>

                <div className="mt-3 text-sm text-neutral-600 dark:text-white/65">
                    Shell Practice uses a real interactive Bash session, so it is only available to signed-in users.
                </div>

                <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70">
                    <div className="font-bold">What you’ll get after signing in</div>
                    <div className="mt-2 space-y-1 font-mono text-xs">
                        <div>pwd</div>
                        <div>ls</div>
                        <div>mkdir notes</div>
                        <div>touch notes/hello.txt</div>
                        <div>cat README.txt</div>
                    </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={onLogin}
                        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-950"
                    >
                        Sign in to continue
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ProgrammingIdeSandbox({
                                                  initialLanguage = "python",
                                                  initialSurfaceMode = "code",
                                                  shellHref,
                                                  toolSlug = "python",
                                                  title = "Programming IDE",
                                                  routeLanguageMap,
                                                  lessonHref,
                                                  lessonLabel = "Lesson",
                                                  access,
                                              }: {
    initialLanguage?: CodeLanguage;
    initialSurfaceMode?: SurfaceMode;
    shellHref?: string;
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
    const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>(initialSurfaceMode);

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
        setSurfaceMode(initialSurfaceMode);
    }, [initialSurfaceMode]);

    useEffect(() => {
        const hrefs = Object.values(routeLanguageMap ?? {}).filter(
            (v): v is string => typeof v === "string" && !!v,
        );

        hrefs.forEach((href) => {
            router.prefetch(href);
        });

        if (shellHref && access.hasUser) {
            router.prefetch(shellHref);
        }
    }, [router, routeLanguageMap, shellHref, access.hasUser]);

    useEffect(() => {
        return () => clearReadyTimer();
    }, []);

    const active = useMemo(
        () => LANGS.find((x) => x.id === lang) ?? LANGS[0],
        [lang],
    );

    const authHref = useAuthHref();
    const shellRequiresLogin = !access.hasUser;

    const handleLanguageChange = (next: CodeLanguage) => {
        if (next === lang && surfaceMode === "code") return;

        clearReadyTimer();
        loadingStartedAtRef.current = Date.now();
        setIdeReady(false);
        setLang(next);

        const href = routeLanguageMap?.[next];
        if (href) {
            router.push(href);
            return;
        }

        setSurfaceMode("code");
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

    const shellInitialFiles = useMemo(
        () => [
            {
                path: "README.txt",
                content: [
                    "Shell practice workspace",
                    "",
                    "Try commands like:",
                    "pwd",
                    "ls",
                    "mkdir notes",
                    "touch notes/hello.txt",
                    'echo "hello" > notes/hello.txt',
                    "cat notes/hello.txt",
                ].join("\n"),
            },
        ],
        [],
    );

    const handleSurfaceModeChange = (next: SurfaceMode) => {
        if (next === surfaceMode) return;

        if (next === "shell") {
            if (shellRequiresLogin) {
                if (initialSurfaceMode === "shell") {
                    setSurfaceMode("shell");
                    return;
                }
                router.push(authHref as any);
                return;
            }

            if (shellHref) {
                router.push(shellHref);
                return;
            }

            setSurfaceMode("shell");
            return;
        }

        clearReadyTimer();
        loadingStartedAtRef.current = Date.now();
        setIdeReady(false);

        const href = routeLanguageMap?.[lang];
        if (href) {
            router.push(href);
            return;
        }

        setSurfaceMode("code");
    };

    const showShellWall = surfaceMode === "shell" && shellRequiresLogin;

    return (
        <div className="h-dvh w-full min-w-0 overflow-hidden bg-transparent">
            <div className="grid h-full min-h-0 min-w-0 w-full grid-rows-[auto_1fr]">
                <div className="border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-neutral-950/95">
                    {/*<div className="flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2.5">*/}
                    {/*    <div className="min-w-0">*/}
                    {/*        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">*/}
                    {/*            Workspace*/}
                    {/*        </div>*/}

                    {/*        <div className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white/90">*/}
                    {/*            {surfaceMode === "code" ? active.label : "Shell Practice"}*/}
                    {/*        </div>*/}
                    {/*    </div>*/}

                    {/*    <SurfaceModeSwitch*/}
                    {/*        mode={surfaceMode}*/}
                    {/*        shellRequiresLogin={shellRequiresLogin}*/}
                    {/*        onModeChange={handleSurfaceModeChange}*/}
                    {/*    />*/}
                    {/*</div>*/}

                    {surfaceMode === "code" ? (
                        <div className="w-full min-w-0 px-2 pb-2 lg:hidden">
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
                    ) : (
                        <div className="px-3 pb-3 text-xs font-medium text-neutral-500 dark:text-white/45">
                            {shellRequiresLogin
                                ? "Sign in required to use the interactive Bash shell."
                                : "Real interactive Bash session. Type directly in the terminal and press Enter."}
                        </div>
                    )}
                </div>

                <div className="min-h-[100vh] min-w-0 lg:flex">
                    {surfaceMode === "code" ? (
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
                    ) : (
                        <aside className="hidden w-[220px] shrink-0 border-r border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-950 lg:block">
                            <div className="flex h-full flex-col">
                                <div className="border-b border-neutral-200 px-3 py-3 dark:border-white/10">
                                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                                        Shell
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white/90">
                                        Command-line practice
                                    </div>
                                </div>

                                <div className="space-y-3 p-3 text-sm text-neutral-700 dark:text-white/70">
                                    <div>
                                        {shellRequiresLogin
                                            ? "Sign in to unlock interactive shell practice."
                                            : "Practice core commands without switching language workspace."}
                                    </div>

                                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                                        <div className="font-bold">Try:</div>
                                        <div className="mt-2 space-y-1 font-mono">
                                            <div>pwd</div>
                                            <div>ls</div>
                                            <div>mkdir notes</div>
                                            <div>touch notes/a.txt</div>
                                            <div>cat README.txt</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </aside>
                    )}

                    <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                        {surfaceMode === "code" ? (
                            <>
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
                                    loginHref={authHref as any}
                                    billingHref="/billing"
                                    draftStorageMode="local"
                                    projectTitle={`${title} Project`}
                                />

                                {!ideReady ? (
                                    <ProgrammingIdeTransitionCover label={active.label} />
                                ) : null}
                            </>
                        ) : showShellWall ? (
                            <ShellLoginWall onLogin={() => router.push(authHref as any)} />
                        ) : (
                            <div className="h-full">
                                <BashTerminal
                                    className="h-full"
                                    title="Shell Practice"
                                    initialFiles={shellInitialFiles}
                                    autoStart
                                />
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}