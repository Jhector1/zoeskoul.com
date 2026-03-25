// src/app/profile/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import {auth} from "@/lib/auth"; // ✅ adjust to your project

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
        select: { id: true, name: true, email: true, image: true },
    });

    if (!user) {
        // If session exists but user row doesn't, safest is sign-in again
        redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/profile")}`);
    }
    const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME;                                    {String(APP_NAME).toUpperCase()}
    {}

    return (
        <div className="ui-container py-8">
            <div className="mb-6">
                <div className="ui-section-kicker">Account</div>
                <h1 className="ui-section-title">Profile</h1>
                <p className="ui-section-subtitle">
                    Update your public info used across {String(APP_NAME).toUpperCase()} (certificates, progress views, and account UI).
                </p>
            </div>

            <ProfileForm initialUser={user} />
        </div>
    );
}