"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import SubjectTile from "./SubjectTile";
import Pill from "./Pill";
import { ROUTES } from "@/utils";
import { cn } from "@/lib/cn";
import { useTaggedT } from "@/i18n/tagged";

export type SubjectCard = {
    slug: string;
    title: string;
    description: string;
    defaultModuleSlug: string | null;
    imagePublicId: string | null;
    imageAlt: string | null;
    enrolled: boolean;
    status: "active" | "coming_soon" | "disabled";
};

function Surface({
                     children,
                     className,
                 }: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-[28px] border p-4 sm:p-5 lg:p-6",
                "bg-white/78 border-black/5 shadow-[0_20px_60px_-28px_rgba(0,0,0,0.28)] backdrop-blur-xl",
                "dark:bg-white/[0.06] dark:border-white/10 dark:shadow-none",
                className,
            )}
        >
            {children}
        </div>
    );
}

function SectionKicker({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">
            {children}
        </div>
    );
}

export default function SubjectPicker({
                                          initialSubjects,
                                      }: {
    initialSubjects: SubjectCard[];
}) {
    const router = useRouter();
    const { t } = useTaggedT("subjectsUi");

    const [q, setQ] = useState("");
    const [subjects, setSubjects] = useState<SubjectCard[]>(initialSubjects);
    const [enrollingSlug, setEnrollingSlug] = useState<string | null>(null);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return subjects;

        return subjects.filter(
            (x) =>
                x.title.toLowerCase().includes(s) ||
                x.slug.toLowerCase().includes(s) ||
                x.description.toLowerCase().includes(s),
        );
    }, [q, subjects]);

    const counts = useMemo(() => {
        const active = subjects.filter((x) => x.status === "active").length;
        const enrolled = subjects.filter((x) => x.enrolled).length;
        const comingSoon = subjects.filter((x) => x.status === "coming_soon").length;

        return { active, enrolled, comingSoon };
    }, [subjects]);

    async function enrollSubject(slug: string) {
        const res = await fetch(`/api/subjects/${encodeURIComponent(slug)}/enroll`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            cache: "no-store",
        });

        if (!res.ok) throw new Error("Enroll failed");
        return res;
    }

    async function pickSubject(s: SubjectCard) {
        if (s.status !== "active") return;
        if (!s.defaultModuleSlug) return;
        if (enrollingSlug) return;

        if (!s.enrolled) {
            setEnrollingSlug(s.slug);

            try {
                await enrollSubject(s.slug);
                setSubjects((prev) =>
                    prev.map((x) => (x.slug === s.slug ? { ...x, enrolled: true } : x)),
                );
            } catch {
                setEnrollingSlug(null);
                return;
            } finally {
                setEnrollingSlug(null);
            }
        }

        router.push(ROUTES.subjectModules(encodeURIComponent(s.slug)));
    }

    return (
        <div
            className={cn(
                "relative min-h-screen overflow-hidden text-neutral-900 dark:text-white/90",
                "bg-[radial-gradient(1000px_500px_at_0%_0%,rgba(16,185,129,0.14),transparent_60%),radial-gradient(1000px_500px_at_100%_0%,rgba(59,130,246,0.10),transparent_58%),linear-gradient(180deg,#f8fffb_0%,#ffffff_40%,#f7f8ff_100%)]",
                "dark:bg-[radial-gradient(1000px_500px_at_0%_0%,rgba(16,185,129,0.12),transparent_55%),radial-gradient(1000px_500px_at_100%_0%,rgba(59,130,246,0.10),transparent_55%),linear-gradient(180deg,#0c1018_0%,#0b0d12_45%,#0b0d12_100%)]",
            )}
        >
            <div
                className="pointer-events-none absolute -top-20 left-[-10%] h-64 w-64 rounded-full bg-emerald-300/25 blur-3xl dark:bg-emerald-300/10"
                aria-hidden
            />
            <div
                className="pointer-events-none absolute right-[-8%] top-10 h-72 w-72 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-300/10"
                aria-hidden
            />

            <div className="ui-container relative py-5 sm:py-7 lg:py-10">
                <div className="grid gap-4 lg:gap-6">
                    <Surface>
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.85fr)] lg:gap-6">
                            <div className="min-w-0">
                                <SectionKicker>{t("headerTitle")}</SectionKicker>

                                <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">
                                    {t("headerTitle")}
                                </h1>

                                <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 sm:text-[15px] dark:text-white/70">
                                    {t("headerSubtitle")}
                                </p>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Pill tone="neutral">
                                        {t("resultsCount", { count: filtered.length })}
                                    </Pill>
                                    <Pill tone="good">{counts.enrolled} enrolled</Pill>
                                    <Pill tone="neutral">{counts.active} active</Pill>
                                    {counts.comingSoon > 0 ? (
                                        <Pill tone="warn">{counts.comingSoon} coming soon</Pill>
                                    ) : null}
                                </div>
                            </div>

                            <div
                                className={cn(
                                    "rounded-[24px] p-4 sm:p-5",
                                    "bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.86))]",
                                    "ring-1 ring-black/5",
                                    "dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))] dark:ring-white/10",
                                )}
                            >
                                <SectionKicker>{t("searchPlaceholder")}</SectionKicker>

                                <div className="mt-3">
                                    <div className="relative">
                                        <input
                                            value={q}
                                            onChange={(e) => setQ(e.target.value)}
                                            placeholder={t("searchPlaceholder")}
                                            className={cn(
                                                "ui-focus w-full rounded-2xl border px-4 py-3 pr-14 text-sm font-semibold",
                                                "ui-border ui-text",
                                                "min-h-12",
                                            )}
                                            style={{
                                                backgroundColor: "rgb(var(--ui-surface) / 0.82)",
                                            }}
                                        />

                                        {q.trim() ? (
                                            <button
                                                type="button"
                                                onClick={() => setQ("")}
                                                className={cn(
                                                    "absolute right-2 top-1/2 -translate-y-1/2",
                                                    "inline-flex h-9 items-center justify-center rounded-xl px-3",
                                                    "text-xs font-extrabold transition",
                                                    "bg-neutral-900 text-white hover:opacity-90",
                                                    "dark:bg-white/10 dark:text-white/90 dark:hover:bg-white/12",
                                                )}
                                                aria-label={t("searchClear")}
                                            >
                                                {t("searchClear")}
                                            </button>
                                        ) : null}
                                    </div>

                                    <div className="mt-3 text-xs text-neutral-500 dark:text-white/55">
                                        Search by title, slug, or description.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Surface>

                    {filtered.length ? (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {filtered.map((s) => (
                                <SubjectTile
                                    key={s.slug}
                                    s={s}
                                    onPick={pickSubject}
                                    enrolling={enrollingSlug === s.slug}
                                />
                            ))}
                        </div>
                    ) : (
                        <Surface className="text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 text-white dark:bg-white/10 dark:text-white/90">
                                ?
                            </div>

                            <div className="mt-4 text-lg font-black tracking-tight">
                                {t("noSubjectsFound")}
                            </div>

                            <div className="mt-2 text-sm text-neutral-600 dark:text-white/65">
                                Try a different keyword or clear the search field.
                            </div>

                            {q.trim() ? (
                                <div className="mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setQ("")}
                                        className={cn(
                                            "inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2 text-sm font-extrabold",
                                            "bg-neutral-900 text-white shadow-sm transition hover:shadow-md active:scale-[0.99]",
                                            "dark:bg-white/10 dark:text-white/90 dark:hover:bg-white/12",
                                        )}
                                    >
                                        {t("searchClear")}
                                    </button>
                                </div>
                            ) : null}
                        </Surface>
                    )}
                </div>
            </div>
        </div>
    );
}