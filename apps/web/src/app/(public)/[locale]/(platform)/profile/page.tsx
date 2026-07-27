// src/app/profile/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import { auth } from "@/lib/auth";

import { resolveTeachingRoleAccess } from "@/lib/teaching/teachingRoleAccess";
import type { ProfileWorkspaceRole } from "@/lib/profile/profileNavigation";
import { parseMarketingProviderName } from "@/lib/marketing/provider";

import ProfileForm from "./ProfileForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
    const session = await auth();
    const email = session?.user?.email ?? null;

    if (!email) {
        // Product-ready: bounce to sign-in with callback
        redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/profile")}`);
    }

    const user = await prisma.user.findUnique({
        where: { email },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            roles: true,
            marketingPreference: {
                select: {
                    marketingEmails: true,
                    consentAt: true,
                    consentSource: true,
                    declinedAt: true,
                    unsubscribedAt: true,
                    provider: true,
                    syncStatus: true,
                    syncedAt: true,
                },
            },
        },
    });

    if (!user) {
        // If session exists but user row doesn't, safest is sign-in again
        redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/profile")}`);
    }
    const roleAccess = resolveTeachingRoleAccess({
        roles: user.roles ?? [],
        email: user.email,
        configuredAdminEmails: (process.env.ADMIN_EMAILS ?? "").split(","),
    });
    const workspaceRole: ProfileWorkspaceRole = roleAccess.isAdmin
        ? "admin"
        : roleAccess.isTeacher
            ? "teacher"
            : "student";
    const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "ZoeSkoul";

    return (
        <div className="ui-container py-8">
            <div className="mb-6">
                <div className="ui-section-kicker">Account</div>
                <h1 className="ui-section-title">Profile</h1>
                <p className="ui-section-subtitle">
                    Update your public info used across {appName.toUpperCase()} (certificates, progress views, and account UI).
                </p>
            </div>

            <ProfileForm
                initialUser={{
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                }}
                workspaceRole={workspaceRole}
                appName={appName}
                initialMarketingPreference={user.marketingPreference ? {
                    marketingEmails: user.marketingPreference.marketingEmails,
                    consentAt: user.marketingPreference.consentAt?.toISOString() ?? null,
                    consentSource: user.marketingPreference.consentSource,
                    declinedAt: user.marketingPreference.declinedAt?.toISOString() ?? null,
                    unsubscribedAt: user.marketingPreference.unsubscribedAt?.toISOString() ?? null,
                    provider: parseMarketingProviderName(user.marketingPreference.provider),
                    syncStatus: user.marketingPreference.syncStatus,
                    syncedAt: user.marketingPreference.syncedAt?.toISOString() ?? null,
                } : {
                    marketingEmails: false,
                    consentAt: null,
                    consentSource: null,
                    declinedAt: null,
                    unsubscribedAt: null,
                    provider: null,
                    syncStatus: null,
                    syncedAt: null,
                }}
            />
        </div>
    );
}
