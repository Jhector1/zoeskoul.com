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
import {AppLocale} from "@/lib/seo/types";
import {getRouteSeo, getSharedSeo} from "@/lib/seo/getSeo";
import {buildMetadata} from "@/lib/seo/buildMetadata"; // adjust path if needed

const CONTACT_LINKS = {
    generalEmail: "hello@zoeskoul.com",
    supportEmail: "support@zoeskoul.com",
    partnershipEmail: "partners@zoeskoul.com",
    whatsappNumber: "1234567890", // digits only
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
    const base =
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition";
    const styles =
        variant === "primary"
            ? "bg-black text-white hover:opacity-90 dark:bg-white dark:text-black"
            : "border border-black/10 bg-white text-black hover:bg-black hover:text-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white dark:hover:text-black";

    if (external || href.startsWith("mailto:")) {
        return (
            <a
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer noopener" : undefined}
                className={`${base} ${styles}`}
            >
                <span>{label}</span>
                <ArrowRight className="h-4 w-4" />
            </a>
        );
    }

    return (
        <Link href={href} className={`${base} ${styles}`}>
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
        <div className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-white/5">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 text-black dark:bg-white/10 dark:text-white">
                {icon}
            </div>

            <h3 className="text-lg font-bold tracking-tight text-black dark:text-white">
                {title}
            </h3>

            <p className="mt-2 text-sm leading-6 text-black/65 dark:text-white/65">
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
    { params }: { params: Promise<{ locale: string }> }
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
        imageAlt: shared.defaultOgAlt
    });
}

export default async function ContactPage() {
    const { tMaybe, rawMaybe } = await getServerI18n("contact");

    const generalMailto = buildMailto(
        CONTACT_LINKS.generalEmail,
        tMaybe("mailSubjects.general", FALLBACK.mailGeneral)
    );

    const supportMailto = buildMailto(
        CONTACT_LINKS.supportEmail,
        tMaybe("mailSubjects.support", FALLBACK.mailSupport)
    );

    const partnershipMailto = buildMailto(
        CONTACT_LINKS.partnershipEmail,
        tMaybe("mailSubjects.partnership", FALLBACK.mailPartnership)
    );

    const whatsappHref = `https://wa.me/${CONTACT_LINKS.whatsappNumber}`;

    // const whatsappHref = `https://wa.me/${CONTACT_LINKS.whatsappNumber}`;

    const availabilityItems = rawMaybe<readonly string[]>(
        "availability.items",
        FALLBACK.availabilityItems
    );


    const cards = [
        {
            icon: <Mail className="h-6 w-6" />,
            title: tMaybe("cards.general.title", FALLBACK.generalTitle),
            description: tMaybe(
                "cards.general.description",
                FALLBACK.generalDescription
            ),
            href: generalMailto,
            cta: tMaybe("cards.general.cta", FALLBACK.generalCta),
            external: false,
        },
        {
            icon: <LifeBuoy className="h-6 w-6" />,
            title: tMaybe("cards.support.title", FALLBACK.supportTitle),
            description: tMaybe(
                "cards.support.description",
                FALLBACK.supportDescription
            ),
            href: supportMailto,
            cta: tMaybe("cards.support.cta", FALLBACK.supportCta),
            external: false,
        },
        {
            icon: <MessageCircle className="h-6 w-6" />,
            title: tMaybe("cards.whatsapp.title", FALLBACK.whatsappTitle),
            description: tMaybe(
                "cards.whatsapp.description",
                FALLBACK.whatsappDescription
            ),
            href: whatsappHref,
            cta: tMaybe("cards.whatsapp.cta", FALLBACK.whatsappCta),
            external: true,
        },
        {
            icon: <CalendarDays className="h-6 w-6" />,
            title: tMaybe("cards.demo.title", FALLBACK.demoTitle),
            description: tMaybe("cards.demo.description", FALLBACK.demoDescription),
            href: CONTACT_LINKS.demoUrl,
            cta: tMaybe("cards.demo.cta", FALLBACK.demoCta),
            external: true,
        },
        {
            icon: <Briefcase className="h-6 w-6" />,
            title: tMaybe("cards.partnerships.title", FALLBACK.partnershipsTitle),
            description: tMaybe(
                "cards.partnerships.description",
                FALLBACK.partnershipsDescription
            ),
            href: partnershipMailto,
            cta: tMaybe("cards.partnerships.cta", FALLBACK.partnershipsCta),
            external: false,
        },
        {
            icon: <BookOpen className="h-6 w-6" />,
            title: tMaybe("cards.help.title", FALLBACK.helpTitle),
            description: tMaybe("cards.help.description", FALLBACK.helpDescription),
            href: CONTACT_LINKS.helpCenterUrl,
            cta: tMaybe("cards.help.cta", FALLBACK.helpCta),
            external: false,
        },
    ];

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_35%),linear-gradient(to_bottom,#ffffff,#f8fafc)] text-black dark:bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_30%),linear-gradient(to_bottom,#0b1020,#111827)] dark:text-white">
            <section className="mx-auto max-w-7xl px-6 py-14 md:px-10 md:py-20">
                <div className="mx-auto max-w-3xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black/70 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white/70">
                        <Sparkles className="h-4 w-4" />
                        <span>{tMaybe("eyebrow", FALLBACK.eyebrow)}</span>
                    </div>

                    <h1 className="mt-6 text-4xl font-black tracking-tight text-black md:text-6xl dark:text-white">
                        {tMaybe("hero.title", FALLBACK.heroTitle)}
                    </h1>

                    <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-black/65 dark:text-white/65 md:text-lg">
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

                <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
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

                <div className="mt-16 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
                    <div className="rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
                        <h2 className="text-2xl font-bold tracking-tight text-black dark:text-white">
                            {tMaybe("quickHelp.title", FALLBACK.quickHelpTitle)}
                        </h2>

                        <p className="mt-3 text-sm leading-7 text-black/65 dark:text-white/65">
                            {tMaybe(
                                "quickHelp.description",
                                FALLBACK.quickHelpDescription
                            )}
                        </p>

                        <div className="mt-6 flex flex-wrap gap-3">
                            <ContactButton
                                href={CONTACT_LINKS.pricingUrl}
                                label={tMaybe(
                                    "quickHelp.ctaPricing",
                                    FALLBACK.quickHelpPricing
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
                                    FALLBACK.quickHelpPartnership
                                )}
                                variant="secondary"
                            />
                        </div>
                    </div>

                    <div className="rounded-3xl p-5  border border-black/10 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/5">
                        <h2 className="text-2xl font-bold tracking-tight text-black dark:text-white">
                            {tMaybe("availability.title", FALLBACK.availabilityTitle)}
                        </h2>

                        <p className="mt-3 text-sm leading-7 text-black/65 dark:text-white/65">
                            {tMaybe(
                                "availability.description",
                                FALLBACK.availabilityDescription
                            )}
                        </p>

                        <div className="mt-6 space-y-3 text-sm">
                            {availabilityItems.map((item) => (
                                <div
                                    key={item}
                                    className="rounded-2xl bg-black/5 px-4 py-3 text-black/80 dark:bg-white/10 dark:text-white/85"
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