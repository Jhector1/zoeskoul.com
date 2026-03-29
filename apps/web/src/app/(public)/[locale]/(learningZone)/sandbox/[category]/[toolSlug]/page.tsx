import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";
import type { AppLocale } from "@/lib/seo/types";
import { resolveSandboxToolEntry } from "@/lib/sandbox/toolRegistry";
// import { getCurrentActor } from "@/lib/auth/";
import { checkIdeCapability } from "@/lib/access/ideCapabilityServer";

import SandboxToolClient, { type SandboxAccess } from "./SandboxToolClient";
import {getActor} from "@/lib/practice/actor";

type PageProps = {
    params: Promise<{
        locale: string;
        category: string;
        toolSlug: string;
    }>;
};

export async function generateMetadata(
    { params }: PageProps,
): Promise<Metadata> {
    const { locale, category, toolSlug } = await params;
    const l = locale as AppLocale;

    const entry = resolveSandboxToolEntry(category, toolSlug);
    if (!entry) notFound();

    const seo = await getRouteSeo(l, entry.seoKey);
    const shared = await getSharedSeo(l);

    return buildMetadata({
        locale: l,
        path: `/sandbox/${category}/${toolSlug}`,
        title: seo.title,
        description: seo.description,
        keywords: shared.keywords,
        ogTitle: seo.ogTitle,
        ogDescription: seo.ogDescription,
        twitterTitle: seo.twitterTitle,
        twitterDescription: seo.twitterDescription,
        imageAlt: shared.defaultOgAlt,
        noIndex: false,
    });
}

async function getSandboxAccess(): Promise<SandboxAccess> {
    const actor = await getActor();

    const [multiFileDecision, saveDecision] = await Promise.all([
        checkIdeCapability(prisma, {
            actor,
            capability: "multi_file",
        }),
        checkIdeCapability(prisma, {
            actor,
            capability: "save_cloud",
        }),
    ]);
console.log({
    hasUser: Boolean(actor.userId),
    canUseMultiFile: multiFileDecision.ok,
    canSaveCloud: saveDecision.ok,
    canCreateProjects: saveDecision.ok,
})
    return {
        hasUser: Boolean(actor.userId),
        canUseMultiFile: multiFileDecision.ok,
        canSaveCloud: saveDecision.ok,
        canCreateProjects: saveDecision.ok,
    };
}

export default async function SandboxToolPage({
                                                  params,
                                              }: PageProps) {
    const { locale, category, toolSlug } = await params;

    const entry = resolveSandboxToolEntry(category, toolSlug);
    if (!entry) notFound();

    const access =
        entry.kind === "programming"
            ? await getSandboxAccess()
            : {
                hasUser: false,
                canUseMultiFile: false,
                canSaveCloud: false,
                canCreateProjects: false,
            };

    return (
        <SandboxToolClient
            locale={locale}
            entry={entry}
            access={access}
        />
    );
}