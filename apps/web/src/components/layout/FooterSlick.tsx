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
    const className =
        "inline-flex items-center text-sm text-[rgb(var(--ui-text-muted)/0.9)] transition-colors hover:text-[rgb(var(--ui-text)/0.96)]";

    if (external) {
        return (
            <a
                href={href}
                className={className}
                target="_blank"
                rel="noreferrer noopener"
            >
                {label}
            </a>
        );
    }

    return (
        <Link href={href} className={className}>
            {label}
        </Link>
    );
}

function HighlightItem({
                           icon: Icon,
                           label,
                       }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
}) {
    return (
        <div className="ui-surface-soft flex items-center gap-3 px-4 py-3">
            <div className="ui-surface-muted grid h-9 w-9 shrink-0 place-items-center rounded-lg">
                <Icon className="h-4 w-4 text-[rgb(var(--ui-text-muted)/0.9)]" />
            </div>
            <span className="text-sm font-medium text-[rgb(var(--ui-text)/0.92)]">
        {label}
      </span>
        </div>
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
                {
                    href: ROUTES.subjectModules("linear-algebra"),
                    label: t("links.linearAlgebra"),
                },
                { href: ROUTES.subjectModules("ai-literacy"), label: t("links.aiChatgpt") },
                {
                    href: ROUTES.subjectModules("cyber-security"),
                    label: t("links.cybersecurity"),
                },
                {
                    href: ROUTES.subjectModules("haitian-creole"),
                    label: t("links.haitianCreole"),
                },
            ],
        },
        {
            title: t("sections.company"),
            links: [
                { href: "/contact", label: t("links.contact") },
                {
                    href: `mailto:${SUPPORT_EMAIL}`,
                    label: t("links.support"),
                    external: true,
                },
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
                "relative mt-16 border-t border-[rgb(var(--ui-border)/0.9)]",
                className,
            )}
            style={{
                backgroundColor: "rgb(var(--ui-surface-2) / 0.72)",
            }}
        >
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <div className="space-y-6">
                        <div className="flex items-start gap-3">
                            <div className="ui-page-surface grid h-11 w-11 shrink-0 place-items-center rounded-lg">
                                <Sparkles className="h-5 w-5 text-[rgb(var(--ui-text)/0.96)]" />
                            </div>

                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold tracking-tight text-[rgb(var(--ui-text)/0.96)]">
                    {brand}
                  </span>
                                    <span className="ui-pill-neutral">{t("badge")}</span>
                                </div>

                                <p className="mt-3 max-w-2xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.88)]">
                                    {t("tagline")}
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                            {highlights.map((item) => (
                                <HighlightItem
                                    key={item.label}
                                    icon={item.icon}
                                    label={item.label}
                                />
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                href={ROUTES.catalog}
                                className="ui-btn-primary inline-flex items-center gap-2"
                            >
                                <BookOpen className="h-4 w-4" />
                                {t("actions.browseSubjects")}
                            </Link>

                            <Link
                                href="/legal"
                                className="ui-btn-secondary inline-flex items-center gap-2"
                            >
                                <ShieldCheck className="h-4 w-4" />
                                {t("actions.legalCenter")}
                            </Link>
                        </div>
                    </div>

                    <div className="grid gap-8 sm:grid-cols-2">
                        {sections.map((section) => (
                            <div key={section.title}>
                                <h2 className="ui-kicker">{section.title}</h2>

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

                <div className="mt-10 border-t border-[rgb(var(--ui-border)/0.9)] pt-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                            <p className="text-sm text-[rgb(var(--ui-text-muted)/0.88)]">
                                © {year} {brand}. {t("bottom.rights")}
                            </p>
                            <p className="ui-meta">
                                {t("bottom.locale")}:{" "}
                                <span className="font-medium uppercase text-[rgb(var(--ui-text)/0.92)]">
                  {locale}
                </span>
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[rgb(var(--ui-text-muted)/0.88)]">
                            <a
                                href={`mailto:${SUPPORT_EMAIL}`}
                                className="inline-flex items-center transition-colors hover:text-[rgb(var(--ui-text)/0.96)]"
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