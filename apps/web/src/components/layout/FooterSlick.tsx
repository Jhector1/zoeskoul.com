"use client";

import React from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
    BookOpen,
    Code2,
    Globe2,
    GraduationCap,
    HeartHandshake,
    Mail,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ROUTES } from "@/utils";

type FooterLink = {
    href: string;
    label: string;
    external?: boolean;
};

type FooterSection = {
    title: string;
    links: FooterLink[];
};

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "ZoeSkoul";
const SUPPORT_EMAIL = "support@zoeskoul.com";

function FooterLinkItem({ href, label, external }: FooterLink) {
    const base =
        "inline-flex items-center text-sm text-neutral-600 transition hover:text-neutral-900 dark:text-white/65 dark:hover:text-white";

    if (external) {
        return (
            <a
                href={href}
                className={base}
                target="_blank"
                rel="noreferrer noopener"
            >
                {label}
            </a>
        );
    }

    return (
        <Link href={href} className={base}>
            {label}
        </Link>
    );
}

export default function FooterSlick({
                                        brand = APP_NAME,
                                        className,
                                    }: {
    brand?: string;
    className?: string;
}) {
    const t = useTranslations("Footer");
    const locale = useLocale();
    const year = new Date().getFullYear();

    const sections: FooterSection[] = [
        {
            title: t("sections.explore"),
            links: [
                { href: ROUTES.home, label: t("links.home") },
                { href: ROUTES.catalog, label: t("links.subjects") },
                { href: ROUTES.pricing, label: t("links.pricing") },
                { href: "/sandbox", label: t("links.sandbox") },
            ],
        },
        {
            title: t("sections.subjects"),
            links: [
                { href: ROUTES.subjectModules("python"), label: t("links.python") },
                { href: ROUTES.subjectModules("linear-algebra"), label: t("links.linearAlgebra") },
                { href: ROUTES.subjectModules("ai-literacy"), label: t("links.aiChatgpt") },
                { href: ROUTES.subjectModules("cyber-security"), label: t("links.cybersecurity") },
                { href: ROUTES.subjectModules("haitian-creole"), label: t("links.haitianCreole") },
            ],
        },
        {
            title: t("sections.company"),
            links: [
                { href: "/contact", label: t("links.contact") },
                { href: `mailto:${SUPPORT_EMAIL}`, label: t("links.support"), external: true },
            ],
        },
        {
            title: t("sections.legal"),
            links: [
                { href: "/legal", label: t("links.legalCenter") },
                { href: "/legal/terms", label: t("links.terms") },
                { href: "/legal/privacy", label: t("links.privacy") },
                { href: "/legal/cookies", label: t("links.cookies") },
                { href: "/legal/refund", label: t("links.refunds") },
                { href: "/legal/acceptable-use", label: t("links.acceptableUse") },
            ],
        },
    ];

    const highlights = [
        {
            icon: Code2,
            label: t("highlights.practiceFirst"),
        },
        {
            icon: Globe2,
            label: t("highlights.multilingual"),
        },
        {
            icon: ShieldCheck,
            label: t("highlights.legal"),
        },
        {
            icon: GraduationCap,
            label: t("highlights.paths"),
        },
    ];

    return (
        <footer
            className={cn(
                "relative mt-16 border-t border-neutral-200/80 bg-neutral-50/80 backdrop-blur dark:border-white/10 dark:bg-neutral-950/80",
                className
            )}
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neutral-300/70 to-transparent dark:via-white/10" />

            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <div className="space-y-6">
                        <div className="flex items-start gap-3">
                            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
                                <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(120%_120%_at_30%_20%,rgba(122,162,255,0.18)_0%,rgba(255,107,214,0.08)_35%,transparent_70%)] opacity-80" />
                                <Sparkles className="relative h-5 w-5 text-neutral-900 dark:text-white" />
                            </div>

                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                    {brand}
                  </span>
                                    <span className="inline-flex rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
                    {t("badge")}
                  </span>
                                </div>

                                <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-white/65">
                                    {t("tagline")}
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                            {highlights.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div
                                        key={item.label}
                                        className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                                    >
                                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]">
                                            <Icon className="h-4 w-4 text-neutral-700 dark:text-white/75" />
                                        </div>
                                        <span className="text-sm font-semibold text-neutral-700 dark:text-white/75">
                      {item.label}
                    </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                href={ROUTES.catalog}
                                className="inline-flex items-center rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-800 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:hover:border-white/20"
                            >
                                <BookOpen className="mr-2 h-4 w-4" />
                                {t("actions.browseSubjects")}
                            </Link>

                            <Link
                                href="/legal"
                                className="inline-flex items-center rounded-xl border border-neutral-200 bg-transparent px-4 py-2 text-sm font-bold text-neutral-700 transition hover:bg-white hover:text-neutral-900 dark:border-white/10 dark:text-white/75 dark:hover:bg-white/[0.05] dark:hover:text-white"
                            >
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                {t("actions.legalCenter")}
                            </Link>
                        </div>
                    </div>

                    <div className="grid gap-8 sm:grid-cols-2">
                        {sections.map((section) => (
                            <div key={section.title}>
                                <h2 className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
                                    {section.title}
                                </h2>

                                <ul className="mt-4 space-y-3">
                                    {section.links.map((link) => (
                                        <li key={`${section.title}-${link.href}`}>
                                            <FooterLinkItem {...link} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-10 border-t border-neutral-200 pt-6 dark:border-white/10">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                            <p className="text-sm text-neutral-600 dark:text-white/65">
                                © {year} {brand}. {t("bottom.rights")}
                            </p>
                            <p className="text-xs text-neutral-500 dark:text-white/45">
                                {t("bottom.locale")}:{" "}
                                <span className="font-semibold uppercase">{locale}</span>
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-600 dark:text-white/65">
                            <a
                                href={`mailto:${SUPPORT_EMAIL}`}
                                className="inline-flex items-center transition hover:text-neutral-900 dark:hover:text-white"
                            >
                                <Mail className="mr-2 h-4 w-4" />
                                {SUPPORT_EMAIL}
                            </a>

                            <span className="inline-flex items-center">
                <HeartHandshake className="mr-2 h-4 w-4" />
                                {t("bottom.builtFor")}
              </span>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}