"use client";

import FullIDE from "@/components/ide/fullide/FullIDE";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LangRail, LANGS } from "@/components/ide/lang/LangRail";
import { CodeLanguage } from "@/lib/practice/types";
import { cn } from "@/components/ide/utils";

export type ProgrammingSandboxAccess = {
    hasUser: boolean;
    canUseMultiFile: boolean;
    canSaveCloud: boolean;
    canCreateProjects: boolean;
};

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

    useEffect(() => {
        setLang(initialLanguage);
    }, [initialLanguage]);

    const active = useMemo(
        () => LANGS.find((x) => x.id === lang) ?? LANGS[0],
        [lang],
    );

    const handleLanguageChange = (next: CodeLanguage) => {
        const href = routeLanguageMap?.[next];

        if (href) {
            router.push(href);
            return;
        }

        setLang(next);
    };

    const storageKey =
        `${process.env.NEXT_PUBLIC_APP_NAME ?? "learnoir"}.ide.workspace.v2.sandbox.programming.${toolSlug}`;

    return (
        <div className="h-dvh w-full min-w-0 overflow-hidden bg-transparent">
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
                                            onClick={() =>
                                                handleLanguageChange(item.id as CodeLanguage)
                                            }
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

                <div className="min-h-0 min-w-0 lg:flex">
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

                    <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
                        <FullIDE
                            className="h-full"
                            title={title}
                            fullHeight
                            storageKey={storageKey}
                            language={lang}
                            onChangeLanguage={handleLanguageChange}
                            resetOnForcedLanguageChange={false}
                            showTopLanguageButtons={false}
                            lessonHref={lessonHref}
                            lessonLabel={lessonLabel}
                            access={access}
                            loginHref="/authenticate"
                            billingHref="/billing"
                            draftStorageMode="local"
                            projectTitle={`${title} Project`}
                        />
                    </main>
                </div>
            </div>
        </div>
    );
}