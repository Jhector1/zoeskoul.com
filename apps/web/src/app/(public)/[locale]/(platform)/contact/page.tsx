import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
    ArrowRight,
    BookOpen,
    Briefcase,
    CalendarDays,
    LifeBuoy,
    Mail,
    MessageCircle,
    Sparkles,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { getServerI18n } from "@/i18n/server";
import { AppLocale } from "@/lib/seo/types";
import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";
import { buildMetadata } from "@/lib/seo/buildMetadata";

const CONTACT_LINKS = {
    generalEmail: "hello@zoeskoul.com",
    supportEmail: "support@zoeskoul.com",
    partnershipEmail: "partners@zoeskoul.com",
    whatsappNumber: "1234567890",
    demoUrl: "https://calendly.com/sygmalink/30min",
    helpCenterUrl: "/help",
    pricingUrl: "/billing",
} as const;

const FALLBACK = {
    metaTitle: "Contact ZoeSkoul",
    metaDescription:
        "Get in touch with ZoeSkoul for support, demos, partnerships, and general questions.",

    eyebrow: "Contact ZoeSkoul",
    heroTitle: "Talk to the ZoeSkoul team",
    heroDescription:
        "Need support, want a demo, or interested in partnerships? Choose the fastest way to reach us below.",
    heroCtaEmail: "Email us",
    heroCtaDemo: "Book a demo",
    heroCtaWhatsApp: "Open WhatsApp",

    generalTitle: "General inquiries",
    generalDescription:
        "Questions about ZoeSkoul, onboarding, features, or how the platform works.",
    generalCta: "Send an email",

    supportTitle: "Support",
    supportDescription:
        "Need help with login, access, billing, subscriptions, or technical issues?",
    supportCta: "Contact support",

    whatsappTitle: "WhatsApp",
    whatsappDescription:
        "Prefer quick messaging? Start a WhatsApp conversation with our team.",
    whatsappCta: "Chat on WhatsApp",

    demoTitle: "Book a demo",
    demoDescription:
        "Schedule a live walkthrough for your school, organization, or team.",
    demoCta: "Book a call",

    partnershipsTitle: "Partnerships",
    partnershipsDescription:
        "Interested in collaboration, licensing, investment, or strategic partnership opportunities?",
    partnershipsCta: "Discuss partnership",

    helpTitle: "Help center",
    helpDescription:
        "Browse platform guides, FAQs, and learning support resources.",
    helpCta: "Open help center",

    quickHelpTitle: "Need something specific?",
    quickHelpDescription:
        "ZoeSkoul supports learners, educators, schools, and organizations that want to deliver training and self-learning experiences.",
    quickHelpPricing: "View pricing",
    quickHelpHelp: "Help center",
    quickHelpPartnership: "Partnership inquiry",

    availabilityTitle: "Best ways to reach us",
    availabilityDescription:
        "Use the option that matches your need so we can respond faster.",
    availabilityItems: [
        "For account and platform issues: Support",
        "For meetings and walkthroughs: Book a demo",
        "For collaboration or business opportunities: Partnerships",
    ],

    mailGeneral: "ZoeSkoul Inquiry",
    mailSupport: "ZoeSkoul Support",
    mailPartnership: "ZoeSkoul Partnership Inquiry",
} as const;

function buildMailto(email: string, subject: string) {
    return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

function ContactButton({
                           href,
                           label,
                           external = false,
                           variant = "primary",
                       }: {
    href: string;
    label: string;
    external?: boolean;
    variant?: "primary" | "secondary";
}) {
    const className =
        variant === "primary"
            ? "ui-btn-primary inline-flex gap-2"
            : "ui-btn-secondary inline-flex gap-2";

    if (external || href.startsWith("mailto:")) {
        return (
            <a
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer noopener" : undefined}
                className={className}
            >
                <span>{label}</span>
                <ArrowRight className="h-4 w-4" />
            </a>
        );
    }

    return (
        <Link href={href} className={className}>
            <span>{label}</span>
            <ArrowRight className="h-4 w-4" />
        </Link>
    );
}

function ContactCard({
                         icon,
                         title,
                         description,
                         href,
                         cta,
                         external = false,
                     }: {
    icon: ReactNode;
    title: string;
    description: string;
    href: string;
    cta: string;
    external?: boolean;
}) {
    return (
        <div className="ui-page-surface p-5">
            <div className="ui-surface-soft inline-flex h-11 w-11 items-center justify-center rounded-lg">
                {icon}
            </div>

            <h3 className="mt-4 ui-title-sm">{title}</h3>

            <p className="mt-2 ui-meta leading-6">
                {description}
            </p>

            <div className="mt-5">
                <ContactButton
                    href={href}
                    label={cta}
                    external={external}
                    variant="secondary"
                />
            </div>
        </div>
    );
}

export async function generateMetadata(
    { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
    const { locale } = await params;
    const l = locale as AppLocale;

    const seo = await getRouteSeo(l, "contact");
    const shared = await getSharedSeo(l);

    return buildMetadata({
        locale: l,
        path: "/contact",
        title: seo.title,
        description: seo.description,
        keywords: shared.keywords,
        ogTitle: seo.ogTitle,
        ogDescription: seo.ogDescription,
        twitterTitle: seo.twitterTitle,
        twitterDescription: seo.twitterDescription,
        imageAlt: shared.defaultOgAlt,
    });
}

export default async function ContactPage() {
    const { tMaybe, rawMaybe } = await getServerI18n("contact");

    const generalMailto = buildMailto(
        CONTACT_LINKS.generalEmail,
        tMaybe("mailSubjects.general", FALLBACK.mailGeneral),
    );

    const supportMailto = buildMailto(
        CONTACT_LINKS.supportEmail,
        tMaybe("mailSubjects.support", FALLBACK.mailSupport),
    );

    const partnershipMailto = buildMailto(
        CONTACT_LINKS.partnershipEmail,
        tMaybe("mailSubjects.partnership", FALLBACK.mailPartnership),
    );

    const whatsappHref = `https://wa.me/${CONTACT_LINKS.whatsappNumber}`;

    const availabilityItems = rawMaybe<readonly string[]>(
        "availability.items",
        FALLBACK.availabilityItems,
    );

    const cards = [
        {
            icon: <Mail className="h-5 w-5" />,
            title: tMaybe("cards.general.title", FALLBACK.generalTitle),
            description: tMaybe(
                "cards.general.description",
                FALLBACK.generalDescription,
            ),
            href: generalMailto,
            cta: tMaybe("cards.general.cta", FALLBACK.generalCta),
            external: false,
        },
        {
            icon: <LifeBuoy className="h-5 w-5" />,
            title: tMaybe("cards.support.title", FALLBACK.supportTitle),
            description: tMaybe(
                "cards.support.description",
                FALLBACK.supportDescription,
            ),
            href: supportMailto,
            cta: tMaybe("cards.support.cta", FALLBACK.supportCta),
            external: false,
        },
        {
            icon: <MessageCircle className="h-5 w-5" />,
            title: tMaybe("cards.whatsapp.title", FALLBACK.whatsappTitle),
            description: tMaybe(
                "cards.whatsapp.description",
                FALLBACK.whatsappDescription,
            ),
            href: whatsappHref,
            cta: tMaybe("cards.whatsapp.cta", FALLBACK.whatsappCta),
            external: true,
        },
        {
            icon: <CalendarDays className="h-5 w-5" />,
            title: tMaybe("cards.demo.title", FALLBACK.demoTitle),
            description: tMaybe("cards.demo.description", FALLBACK.demoDescription),
            href: CONTACT_LINKS.demoUrl,
            cta: tMaybe("cards.demo.cta", FALLBACK.demoCta),
            external: true,
        },
        {
            icon: <Briefcase className="h-5 w-5" />,
            title: tMaybe("cards.partnerships.title", FALLBACK.partnershipsTitle),
            description: tMaybe(
                "cards.partnerships.description",
                FALLBACK.partnershipsDescription,
            ),
            href: partnershipMailto,
            cta: tMaybe("cards.partnerships.cta", FALLBACK.partnershipsCta),
            external: false,
        },
        {
            icon: <BookOpen className="h-5 w-5" />,
            title: tMaybe("cards.help.title", FALLBACK.helpTitle),
            description: tMaybe("cards.help.description", FALLBACK.helpDescription),
            href: CONTACT_LINKS.helpCenterUrl,
            cta: tMaybe("cards.help.cta", FALLBACK.helpCta),
            external: false,
        },
    ];

    return (
        <main
            className="min-h-screen"
            style={{
                backgroundColor: "rgb(var(--ui-bg) / 1)",
                color: "rgb(var(--ui-text) / 1)",
            }}
        >
            <section className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
                <div className="mx-auto max-w-3xl text-center">
                    <div className="inline-flex items-center gap-2">
            <span className="ui-pill-neutral inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>{tMaybe("eyebrow", FALLBACK.eyebrow)}</span>
            </span>
                    </div>

                    <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">
                        {tMaybe("hero.title", FALLBACK.heroTitle)}
                    </h1>

                    <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[rgb(var(--ui-text-muted)/0.88)]">
                        {tMaybe("hero.description", FALLBACK.heroDescription)}
                    </p>

                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                        <ContactButton
                            href={generalMailto}
                            label={tMaybe("hero.ctaEmail", FALLBACK.heroCtaEmail)}
                        />
                        <ContactButton
                            href={CONTACT_LINKS.demoUrl}
                            label={tMaybe("hero.ctaDemo", FALLBACK.heroCtaDemo)}
                            external
                            variant="secondary"
                        />
                        <ContactButton
                            href={whatsappHref}
                            label={tMaybe("hero.ctaWhatsApp", FALLBACK.heroCtaWhatsApp)}
                            external
                            variant="secondary"
                        />
                    </div>
                </div>

                <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {cards.map((card) => (
                        <ContactCard
                            key={card.title}
                            icon={card.icon}
                            title={card.title}
                            description={card.description}
                            href={card.href}
                            cta={card.cta}
                            external={card.external}
                        />
                    ))}
                </div>

                <div className="mt-12 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                    <div className="ui-page-surface p-5">
                        <h2 className="text-2xl font-semibold tracking-tight">
                            {tMaybe("quickHelp.title", FALLBACK.quickHelpTitle)}
                        </h2>

                        <p className="mt-3 text-sm leading-7 text-[rgb(var(--ui-text-muted)/0.88)]">
                            {tMaybe(
                                "quickHelp.description",
                                FALLBACK.quickHelpDescription,
                            )}
                        </p>

                        <div className="mt-6 flex flex-wrap gap-3">
                            <ContactButton
                                href={CONTACT_LINKS.pricingUrl}
                                label={tMaybe(
                                    "quickHelp.ctaPricing",
                                    FALLBACK.quickHelpPricing,
                                )}
                                variant="secondary"
                            />
                            <ContactButton
                                href={CONTACT_LINKS.helpCenterUrl}
                                label={tMaybe("quickHelp.ctaHelp", FALLBACK.quickHelpHelp)}
                                variant="secondary"
                            />
                            <ContactButton
                                href={partnershipMailto}
                                label={tMaybe(
                                    "quickHelp.ctaPartnership",
                                    FALLBACK.quickHelpPartnership,
                                )}
                                variant="secondary"
                            />
                        </div>
                    </div>

                    <div className="ui-page-surface p-5">
                        <h2 className="text-2xl font-semibold tracking-tight">
                            {tMaybe("availability.title", FALLBACK.availabilityTitle)}
                        </h2>

                        <p className="mt-3 text-sm leading-7 text-[rgb(var(--ui-text-muted)/0.88)]">
                            {tMaybe(
                                "availability.description",
                                FALLBACK.availabilityDescription,
                            )}
                        </p>

                        <div className="mt-6 space-y-3 text-sm">
                            {availabilityItems.map((item) => (
                                <div
                                    key={item}
                                    className="ui-surface-soft px-4 py-3 text-[rgb(var(--ui-text)/0.9)]"
                                >
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}