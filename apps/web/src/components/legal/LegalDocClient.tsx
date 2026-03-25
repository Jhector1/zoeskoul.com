"use client";

import { useMemo } from "react";
import { Link } from "@/i18n/navigation";
// import { resolveDeepTagged } from "@/lib/i18n/resolveDeepTagged";
import { useTaggedT } from "@/i18n/tagged";
import type { LegalDocumentData } from "@/lib/legal/content";
import LegalSectionNav from "@/components/legal/LegalSectionNav";
import {resolveDeepTagged} from "@/i18n/resolveDeepTagged";

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

    const resolved = useMemo(() => {
        return resolveDeepTagged(
            doc,
            (key, vals) => t(key, vals),
            values
        ) as ResolvedDoc;
    }, [doc, values, t]);

    const sectionItems = resolved.sections.map((section) => ({
        id: section.id,
        title: section.title,
    }));

    return (
        <article className="space-y-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
                <LegalSectionNav docTitle={resolved.title} sections={sectionItems} />

                <div className="min-w-0 rounded-3xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900">
                    <div className="border-b border-neutral-200 px-5 py-5 dark:border-white/10 sm:px-8">
                        <nav aria-label="Breadcrumb" className="text-sm text-neutral-500 dark:text-white/45">
                            <Link href="/legal" className="hover:text-neutral-800 dark:hover:text-white">
                                Legal
                            </Link>
                            <span className="mx-2">/</span>
                            <span className="text-neutral-900 dark:text-white">{resolved.title}</span>
                        </nav>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-600 dark:border-white/10 dark:text-white/55">
                {resolved.title}
              </span>
                        </div>

                        <div className="mt-4">
                            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                                {resolved.title}
                            </h1>
                            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/65">
                                {resolved.description}
                            </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-500 dark:text-white/45">
                            <span>Effective Date: {resolved.effectiveDate}</span>
                            <span>Last Updated: {resolved.lastUpdated}</span>
                        </div>
                    </div>

                    <div className="space-y-8 px-5 py-6 sm:px-8 sm:py-8">
                        {resolved.sections.map((section) => (
                            <section
                                key={section.id}
                                id={section.id}
                                className="scroll-mt-32 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 dark:border-white/10 dark:bg-white/[0.03]"
                            >
                                <h2 className="text-xl font-black tracking-tight">{section.title}</h2>

                                <div className="prose prose-neutral mt-4 max-w-none text-sm leading-7 dark:prose-invert prose-p:my-3 prose-ul:my-3 prose-li:my-1">
                                    {section.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}

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