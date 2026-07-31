"use client";

import { useMemo, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { useTaggedT } from "@/i18n/tagged";
import type { LegalDocumentData } from "@/lib/legal/content";
import LegalSectionNav from "@/components/legal/LegalSectionNav";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";

type ResolvedSection = {
    id: string;
    title: string;
    paragraphs?: string[];
    list?: string[];
};

type ResolvedDoc = {
    slug: string;
    title: string;
    description: string;
    effectiveDate: string;
    lastUpdated: string;
    sections: ResolvedSection[];
};

export default function LegalDocClient({
                                           doc,
                                           values,
                                       }: {
    doc: LegalDocumentData;
    values: Record<string, any>;
}) {
    const { t } = useTaggedT();
    const desktopContentScrollRef = useRef<HTMLDivElement | null>(null);

    const resolved = useMemo(() => {
        return resolveDeepTagged(
            doc,
            (key, vals) => t(key, vals),
            values,
        ) as ResolvedDoc;
    }, [doc, values, t]);

    const sectionItems = resolved.sections.map((section) => ({
        id: section.id,
        title: section.title,
    }));

    return (
        <article className="space-y-6 lg:space-y-0">
            {/* Mobile / tablet */}
            <div className="lg:hidden">
                <LegalSectionNav
                    docTitle={resolved.title}
                    sections={sectionItems}
                />
            </div>

            <div className="grid grid-cols-1 gap-8 lg:h-[calc(100svh-11rem)] lg:min-h-[32rem] lg:grid-cols-[280px_minmax(0,1fr)] lg:items-stretch lg:overflow-hidden">
                {/* Desktop sidebar remains still while only the document pane scrolls. */}
                <aside className="hidden lg:block lg:min-h-0 lg:self-stretch">
                    <div className="h-full overflow-y-auto overscroll-contain pr-1">
                        <LegalSectionNav
                            docTitle={resolved.title}
                            sections={sectionItems}
                            desktop
                            scrollContainerRef={desktopContentScrollRef}
                        />
                    </div>
                </aside>

                <div
                    ref={desktopContentScrollRef}
                    className="min-w-0 ui-page-surface overflow-hidden lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
                >
                    <div className="border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-5 py-5 sm:px-8">
                        <nav aria-label="Breadcrumb" className="ui-meta">
                            <Link
                                href="/legal"
                                className="hover:text-[rgb(var(--ui-text)/0.96)]"
                            >
                                Legal
                            </Link>
                            <span className="mx-2">/</span>
                            <span className="text-[rgb(var(--ui-text)/0.96)]">
                {resolved.title}
              </span>
                        </nav>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <span className="ui-pill-neutral">{resolved.title}</span>
                        </div>

                        <div className="mt-4">
                            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                                {resolved.title}
                            </h1>
                            <p className="mt-3 max-w-3xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.88)]">
                                {resolved.description}
                            </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 ui-meta">
                            <span>Effective Date: {resolved.effectiveDate}</span>
                            <span>Last Updated: {resolved.lastUpdated}</span>
                        </div>
                    </div>

                    <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
                        {resolved.sections.map((section) => (
                            <section
                                key={section.id}
                                id={section.id}
                                className="ui-surface-soft scroll-mt-28 p-5 lg:scroll-mt-4"
                            >
                                <h2 className="text-xl font-semibold tracking-tight">
                                    {section.title}
                                </h2>

                                <div className="prose prose-neutral mt-4 max-w-none text-sm leading-7 dark:prose-invert prose-p:my-3 prose-ul:my-3 prose-li:my-1">
                                    {section.paragraphs?.map((p, i) => (
                                        <p key={i}>{p}</p>
                                    ))}

                                    {section.list?.length ? (
                                        <ul>
                                            {section.list.map((item, i) => (
                                                <li key={i}>{item}</li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>
            </div>
        </article>
    );
}
