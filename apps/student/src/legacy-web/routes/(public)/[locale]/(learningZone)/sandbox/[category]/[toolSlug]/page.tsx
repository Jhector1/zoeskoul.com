import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";
import type { AppLocale } from "@/lib/seo/types";
import { resolveSandboxToolEntry } from "@/lib/sandbox/toolRegistry";
import { checkIdeCapability } from "@/lib/access/ideCapabilityServer";
// import { redirectToSignIn } from "@/lib/auth/redirect-to-sign-in";

import SandboxToolClient, { type SandboxAccess } from "./SandboxToolClient";
import { getActor } from "@/lib/practice/actor";
import {redirectToSignIn} from "@/lib/auth/require-auth";

type PageProps = {
    params: Promise<{
        locale: string;
        category: string;
        toolSlug: string;
    }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function searchParamIsTrue(
    searchParams: Record<string, string | string[] | undefined>,
    key: string,
) {
    const value = searchParams[key];

    if (Array.isArray(value)) {
        return value.includes("1") || value.includes("true");
    }

    return value === "1" || value === "true";
}

function allowE2eFullIdeAccess(
    searchParams: Record<string, string | string[] | undefined>,
) {
    if (process.env.E2E_ALLOW_DEV_ROUTES !== "1") {
        return false;
    }

    return searchParamIsTrue(searchParams, "e2eFullIdeAccess");
}

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

async function getSandboxAccessForActor(
    actor: Awaited<ReturnType<typeof getActor>>,
): Promise<SandboxAccess> {
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

    return {
        hasUser: Boolean(actor.userId),
        canUseMultiFile: multiFileDecision.ok,
        canSaveCloud: saveDecision.ok,
        canCreateProjects: saveDecision.ok,
    };
}

export default async function SandboxToolPage({
                                                  params,
                                                  searchParams,
                                              }: PageProps) {
    const { locale, category, toolSlug } = await params;
    const resolvedSearchParams = (await searchParams) ?? {};

    const entry = resolveSandboxToolEntry(category, toolSlug);
    if (!entry) notFound();

    const actor = await getActor();

    if (
        entry.kind === "programming" &&
        entry.toolSlug === "shell" &&
        !actor.userId
    ) {
        redirectToSignIn({
            locale,
            pathname: `/sandbox/${category}/${toolSlug}`,
        });
    }

    const access =
        entry.kind === "programming"
            ? await getSandboxAccessForActor(actor)
            : {
                hasUser: false,
                canUseMultiFile: false,
                canSaveCloud: false,
                canCreateProjects: false,
            };

    const effectiveAccess = allowE2eFullIdeAccess(resolvedSearchParams)
        ? {
              hasUser: true,
              canUseMultiFile: true,
              canSaveCloud: true,
              canCreateProjects: true,
          }
        : access;

    return (
        <SandboxToolClient
            locale={locale}
            entry={entry}
            access={effectiveAccess}
        />
    );
}
