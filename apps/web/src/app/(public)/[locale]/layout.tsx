import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import "../../globals.css";
import type { Metadata, Viewport } from "next";
import React from "react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { routing } from "@/i18n/routing";
import Providers from "../../providers";
import { auth } from "@/lib/auth";
import { SfxProvider } from "@/lib/sfx/SfxProvider";
import { inter, playfair, greatVibes } from "@/app/fonts";
import { getSiteUrl } from "@/lib/seo/site";

type LayoutProps = Readonly<{
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}>;

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    colorScheme: "light dark",
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
        { media: "(prefers-color-scheme: dark)", color: "#070A12" },
    ],
};

export const metadata: Metadata = {
    metadataBase: getSiteUrl(),
    applicationName: process.env.APP_NAME || "ZoeSkoul",
    creator: "Jean Yves Hector",
    publisher: process.env.APP_NAME || "ZoeSkoul",
    classification: "Education",
    referrer: "origin-when-cross-origin",
    manifest: "/site.webmanifest",
    icons: {
        icon: [
            { url: "/favicon.ico" },
            { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        shortcut: "/favicon.ico",
        apple: [
            {
                url: "/icons/apple-touch-icon.png",
                sizes: "180x180",
                type: "image/png",
            },
        ],
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: process.env.APP_NAME || "ZoeSkoul",
    },
    formatDetection: {
        telephone: false,
        address: false,
        email: false,
    },
};

export default async function LocaleLayout({ children, params }: LayoutProps) {
    const { locale } = await params;

    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const session = await auth();
    const messages = await getMessages();

    return (
        <html
            lang={locale}
            className={`${inter.variable} ${playfair.variable} ${greatVibes.variable} h-full w-full overflow-x-hidden`}
            suppressHydrationWarning
        >
        <body className="min-h-dvh w-full min-w-0 overflow-x-hidden bg-[var(--app-bg)] text-neutral-900 dark:text-white">
        <div className="min-h-dvh w-full min-w-0 overflow-x-hidden bg-[radial-gradient(1200px_700px_at_20%_0%,var(--app-bg-ink)_0%,transparent_60%)]">
            <Providers session={session}>
                <NextIntlClientProvider messages={messages}>
                    <SfxProvider>{children}</SfxProvider>
                </NextIntlClientProvider>
            </Providers>
        </div>
        </body>
        </html>
    );
}