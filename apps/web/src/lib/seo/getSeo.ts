import { getTranslations } from "next-intl/server";
import type {
    AppLocale,
    SeoRouteEntry,
    SeoRouteKey,
    SeoSubjectEntry,
    SeoSubjectKey
} from "./types";
import { APP_NAME, fillAppNameArray } from "./site";

export async function getSharedSeo(locale: AppLocale) {
    const t = await getTranslations({ locale, namespace: "seo.shared" });
    const site = await getTranslations({ locale, namespace: "seo.site" });

    const rawKeywords = t.raw("keywords") as string[];

    return {
        keywords: fillAppNameArray(rawKeywords),
        defaultOgAlt: site("defaultOgAlt", { appName: APP_NAME }),
        siteName: site("name", { appName: APP_NAME })
    };
}

export async function getRouteSeo(
    locale: AppLocale,
    key: SeoRouteKey
): Promise<SeoRouteEntry> {
    const t = await getTranslations({
        locale,
        namespace: `seo.routes.${key}`
    });

    return {
        title: t("title", { appName: APP_NAME }),
        description: t("description", { appName: APP_NAME }),
        ogTitle: t("ogTitle", { appName: APP_NAME }),
        ogDescription: t("ogDescription", { appName: APP_NAME }),
        twitterTitle: t("twitterTitle", { appName: APP_NAME }),
        twitterDescription: t("twitterDescription", { appName: APP_NAME })
    };
}

export async function getSubjectSeo(
    locale: AppLocale,
    key: SeoSubjectKey
): Promise<SeoSubjectEntry> {
    const t = await getTranslations({
        locale,
        namespace: `seo.subjects.${key}`
    });

    return {
        title: t("title", { appName: APP_NAME }),
        description: t("description", { appName: APP_NAME }),
        ogTitle: t("ogTitle", { appName: APP_NAME }),
        ogDescription: t("ogDescription", { appName: APP_NAME })
    };
}