import type { MetadataRoute } from "next";
import { LEGAL_INDEX } from "@/lib/legal/content";
import { PUBLIC_INDEXABLE_ROUTES } from "@/lib/seo/publicRoutes";
import { LOCALES, SITE_URL } from "@/lib/seo/site";
import { PUBLIC_SANDBOX_TOOL_PATHS } from "@/lib/sandbox/toolRegistry";

function absoluteUrl(path: string) {
    return `${SITE_URL}${path}`;
}

function localizedPath(locale: string, path: string) {
    return path === "/" || path === "" ? `/${locale}` : `/${locale}${path}`;
}

function makeEntry(
    locale: string,
    path: string
): MetadataRoute.Sitemap[number] {
    return {
        url: absoluteUrl(localizedPath(locale, path)),
        lastModified: new Date(),
        changeFrequency: path === "/" ? "weekly" : "monthly",
        priority: path === "/" ? 1 : 0.8,
        alternates: {
            languages: Object.fromEntries(
                LOCALES.map((l) => [l, absoluteUrl(localizedPath(l, path))])
            )
        }
    } as MetadataRoute.Sitemap[number];
}

export default function sitemap(): MetadataRoute.Sitemap {
    const publicPaths = Array.from(
        new Set<string>([
            ...PUBLIC_INDEXABLE_ROUTES,
            ...LEGAL_INDEX.map((doc) => `/legal/${doc.slug}`),
            ...PUBLIC_SANDBOX_TOOL_PATHS,
        ]),
    );

    return publicPaths.flatMap((path) =>
        LOCALES.map((locale) => makeEntry(locale, path))
    );
}