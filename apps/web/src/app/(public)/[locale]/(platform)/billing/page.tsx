// src/app/(public)/[locale]/billing/page.tsx
import React from "react";
import BillingPageClient from "./BillingPageClient";
import {Metadata} from "next";
import {buildMetadata} from "@/lib/seo/buildMetadata";
import {getRouteSeo, getSharedSeo} from "@/lib/seo/getSeo";
import {AppLocale} from "@/lib/seo/types";

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
                                              searchParams,
                                          }: {
    searchParams?: SearchParams | Promise<SearchParams>;
}) {
    const sp = await Promise.resolve(searchParams ?? {});

    const next = pickString(sp, "next");
    const callbackUrl = safeInternalPath(next ?? pickString(sp, "callbackUrl") ?? "/");

    const paywall = {
        reason: pickString(sp, "reason") ?? null,
        subject: pickString(sp, "subject") ?? null,
        module: pickString(sp, "module") ?? null,
        next: next ? safeInternalPath(next) : null,
        back: pickString(sp, "back") ? safeInternalPath(pickString(sp, "back")!) : null, // ✅ NEW
    };

    return <BillingPageClient callbackUrl={callbackUrl} paywall={paywall} />;
}