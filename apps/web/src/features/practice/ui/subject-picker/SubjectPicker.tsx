"use client";

import React, { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import SubjectCardGrid from "./SubjectCardGrid";
import Pill from "./Pill";
import type { SubjectCard } from "./subjectCardTypes";
import { useSubjectCardController } from "./useSubjectCardController";
import { cn } from "@/lib/cn";
import { useTaggedT } from "@/i18n/tagged";

export type { SubjectCard } from "./subjectCardTypes";

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
    pageTitle,
    pageKicker,
    pageSubtitle,
    emptyTitle,
    emptySubtitle,
    browseHref,
    browseLabel,
    allowEnrollment = true,
}: {
    initialSubjects: SubjectCard[];
    pageTitle?: string;
    pageKicker?: string;
    pageSubtitle?: string;
    emptyTitle?: string;
    emptySubtitle?: string;
    browseHref?: string | null;
    browseLabel?: string;
    allowEnrollment?: boolean;
}) {
    const { t } = useTaggedT("subjectsUi");
    const [q, setQ] = useState("");
    const { subjects, enrollingSlug, pickSubject } = useSubjectCardController({
        initialSubjects,
        allowEnrollment,
    });

    const filtered = useMemo(() => {
        const search = q.trim().toLowerCase();
        if (!search) return subjects;

        return subjects.filter(
            (subject) =>
                subject.title.toLowerCase().includes(search) ||
                subject.slug.toLowerCase().includes(search) ||
                subject.description.toLowerCase().includes(search),
        );
    }, [q, subjects]);

    const counts = useMemo(() => {
        const active = subjects.filter((subject) => subject.status === "active").length;
        const enrolled = subjects.filter((subject) => subject.enrolled).length;
        const comingSoon = subjects.filter(
            (subject) => subject.status === "coming_soon",
        ).length;

        return { active, enrolled, comingSoon };
    }, [subjects]);

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white/90">
            <div className="ui-container py-5 sm:py-7 lg:py-10">
                <div className="grid gap-4 lg:gap-5">
                    <Surface className="p-4 sm:p-5">
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.85fr)] lg:gap-6">
                            <div className="min-w-0">
                                <SectionKicker>{pageKicker ?? t("headerTitle")}</SectionKicker>

                                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
                                    {pageTitle ?? t("headerTitle")}
                                </h1>

                                <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/70">
                                    {pageSubtitle ?? t("headerSubtitle")}
                                </p>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Pill tone="neutral">
                                        {t("resultsCount", { count: filtered.length })}
                                    </Pill>
                                    <Pill tone="good">{counts.enrolled} enrolled</Pill>
                                    <Pill tone="neutral">{counts.active} active</Pill>
                                    {counts.comingSoon > 0 ? (
                                        <Pill tone="warn">
                                            {counts.comingSoon} coming soon
                                        </Pill>
                                    ) : null}
                                    {browseHref && browseLabel ? (
                                        <Link href={browseHref} className="ui-btn-secondary">
                                            {browseLabel}
                                        </Link>
                                    ) : null}
                                </div>
                            </div>

                            <div className="ui-surface p-4">
                                <SectionKicker>{t("searchPlaceholder")}</SectionKicker>

                                <div className="mt-3">
                                    <div className="relative">
                                        <input
                                            value={q}
                                            onChange={(event) => setQ(event.target.value)}
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
                        <SubjectCardGrid
                            subjects={filtered}
                            onPick={pickSubject}
                            enrollingSlug={enrollingSlug}
                        />
                    ) : (
                        <Surface className="p-6 text-center">
                            <div className="ui-icon-box mx-auto h-12 w-12 text-neutral-700 dark:text-white/80">
                                ?
                            </div>

                            <div className="mt-4 text-lg font-semibold tracking-tight">
                                {emptyTitle ?? t("noSubjectsFound")}
                            </div>

                            <div className="mt-2 text-sm text-neutral-600 dark:text-white/65">
                                {emptySubtitle ??
                                    "Try a different keyword or clear the search field."}
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
                            ) : browseHref && browseLabel ? (
                                <div className="mt-4">
                                    <Link href={browseHref} className="ui-btn-secondary">
                                        {browseLabel}
                                    </Link>
                                </div>
                            ) : null}
                        </Surface>
                    )}
                </div>
            </div>
        </div>
    );
}
