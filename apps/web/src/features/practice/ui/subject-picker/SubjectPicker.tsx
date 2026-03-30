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
    return <div className={cn("ui-page-surface", className)}>{children}</div>;
}

function SectionKicker({ children }: { children: React.ReactNode }) {
    return <div className="ui-kicker">{children}</div>;
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
        <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white/90">
            <div className="ui-container py-5 sm:py-7 lg:py-10">
                <div className="grid gap-4 lg:gap-5">
                    <Surface className="p-4 sm:p-5">
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.85fr)] lg:gap-6">
                            <div className="min-w-0">
                                <SectionKicker>{t("headerTitle")}</SectionKicker>

                                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
                                    {t("headerTitle")}
                                </h1>

                                <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/70">
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

                            <div className="ui-surface p-4">
                                <SectionKicker>{t("searchPlaceholder")}</SectionKicker>

                                <div className="mt-3">
                                    <div className="relative">
                                        <input
                                            value={q}
                                            onChange={(e) => setQ(e.target.value)}
                                            placeholder={t("searchPlaceholder")}
                                            className="ui-input-ide min-h-12 w-full pr-14"
                                        />

                                        {q.trim() ? (
                                            <button
                                                type="button"
                                                onClick={() => setQ("")}
                                                className="ui-btn-secondary absolute right-2 top-1/2 -translate-y-1/2"
                                                aria-label={t("searchClear")}
                                            >
                                                {t("searchClear")}
                                            </button>
                                        ) : null}
                                    </div>

                                    <div className="mt-3 text-xs text-neutral-500 dark:text-white/50">
                                        Search by title, slug, or description.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Surface>

                    {filtered.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                        <Surface className="p-6 text-center">
                            <div className="ui-icon-box mx-auto h-12 w-12 text-neutral-700 dark:text-white/80">
                                ?
                            </div>

                            <div className="mt-4 text-lg font-semibold tracking-tight">
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
                                        className="ui-btn-secondary"
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