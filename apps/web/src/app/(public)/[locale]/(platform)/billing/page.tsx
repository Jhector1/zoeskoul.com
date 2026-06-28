// src/app/(public)/[locale]/billing/page.tsx
import React from "react";
import BillingPageClient from "./BillingPageClient";
import {Metadata} from "next";
import {buildMetadata} from "@/lib/seo/buildMetadata";
import {getRouteSeo, getSharedSeo} from "@/lib/seo/getSeo";
import {AppLocale} from "@/lib/seo/types";
import { resolveSubjectTitle } from "@/lib/subjects/resolveSubjectTitle";
import { resolveModuleTitle } from "@/lib/subjects/resolveModuleTitle";

type SearchParams = Record<string, string | string[] | undefined>;

function pickString(sp: SearchParams, key: string) {
    const v = sp[key];
    return typeof v === "string" ? v : undefined;
}

function safeInternalPath(path?: string) {
    const raw = String(path ?? "").trim();
    if (!raw) return "/";
    if (raw.startsWith("//")) return "/";
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return "/";
    return raw.startsWith("/") ? raw : `/${raw}`;
}

export async function generateMetadata(
    { params }: { params: Promise<{ locale: string }> }
): Promise<Metadata> {
    const { locale } = await params;
    const l = locale as AppLocale;

    const seo = await getRouteSeo(l, "billing");
    const shared = await getSharedSeo(l);

    return buildMetadata({
        locale: l,
        path: "/billing",
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



export default async function BillingPage({
                                              params,
                                              searchParams,
                                          }: {
    params: Promise<{ locale: string }>;
    searchParams?: SearchParams | Promise<SearchParams>;
}) {
    const { locale } = await params;
    const sp = await Promise.resolve(searchParams ?? {});

    const next = pickString(sp, "next");
    const callbackUrl = safeInternalPath(next ?? pickString(sp, "callbackUrl") ?? "/");
    const subjectSlug = pickString(sp, "subject") ?? null;
    const moduleSlug = pickString(sp, "module") ?? null;
    const localeForTitles = locale || "en";

    const subjectTitle = subjectSlug
        ? await resolveSubjectTitle({
            subjectSlug,
            locale: localeForTitles,
            fallback: subjectSlug,
        })
        : null;

    const moduleTitle =
        subjectSlug && moduleSlug
            ? await resolveModuleTitle({
                subjectSlug,
                moduleSlug,
                locale: localeForTitles,
                fallback: moduleSlug,
            })
            : moduleSlug;

    const paywall = {
        reason: pickString(sp, "reason") ?? null,
        subject: subjectTitle,
        module: moduleTitle,
        next: next ? safeInternalPath(next) : null,
        back: pickString(sp, "back") ? safeInternalPath(pickString(sp, "back")!) : null, // ✅ NEW
    };

    return <BillingPageClient callbackUrl={callbackUrl} paywall={paywall} />;
}
