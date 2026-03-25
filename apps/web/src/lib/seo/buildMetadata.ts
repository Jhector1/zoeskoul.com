import type { Metadata } from "next";
import type { AppLocale } from "./types";
import {
    APP_NAME,
    LOCALES,
    getOgLocale,
    getSiteUrl,
    localizedPath
} from "./site";

type BuildMetadataInput = {
    locale: AppLocale;
    path: string;
    title: string;
    description: string;
    keywords?: string[];
    ogTitle?: string;
    ogDescription?: string;
    twitterTitle?: string;
    twitterDescription?: string;
    imageUrl?: string;
    imageAlt?: string;
    noIndex?: boolean;
};

export function buildMetadata({
                                  locale,
                                  path,
                                  title,
                                  description,
                                  keywords,
                                  ogTitle,
                                  ogDescription,
                                  twitterTitle,
                                  twitterDescription,
                                  imageUrl,
                                  imageAlt,
                                  noIndex = false
                              }: BuildMetadataInput): Metadata {
    const localized = localizedPath(locale, path);

    const resolvedImageUrl = imageUrl ?? "/og/zoeskoul-og.png";
    const resolvedImageAlt = imageAlt ?? APP_NAME;

    const languages =
        Object.fromEntries(
            LOCALES.map((l) => [l, localizedPath(l, path)])
        ) as NonNullable<NonNullable<Metadata["alternates"]>["languages"]>;

    const alternates: Metadata["alternates"] = {
        canonical: localized,
        languages
    };

    const robots: Metadata["robots"] = noIndex
        ? {
            index: false,
            follow: false,
            googleBot: {
                index: false,
                follow: false,
                noimageindex: true,
                "max-video-preview": 0,
                "max-image-preview": "none",
                "max-snippet": 0
            }
        }
        : {
            index: true,
            follow: true,
            googleBot: {
                index: true,
                follow: true,
                noimageindex: false,
                "max-video-preview": -1,
                "max-image-preview": "large",
                "max-snippet": -1
            }
        };

    const openGraph = {
        type: "website",
        url: localized,
        siteName: APP_NAME,
        locale: getOgLocale(locale),
        title: ogTitle ?? title,
        description: ogDescription ?? description,
        images: [
            {
                url: resolvedImageUrl,
                width: 1200,
                height: 630,
                alt: resolvedImageAlt
            }
        ]
    } satisfies NonNullable<Metadata["openGraph"]>;

    const twitter = {
        card: "summary_large_image",
        title: twitterTitle ?? ogTitle ?? title,
        description: twitterDescription ?? ogDescription ?? description,
        images: [resolvedImageUrl]
    } satisfies NonNullable<Metadata["twitter"]>;

    const metadata: Metadata = {
        metadataBase: getSiteUrl(),
        title,
        description,
        keywords,
        alternates,
        robots,
        openGraph,
        twitter
    };

    return metadata;
}