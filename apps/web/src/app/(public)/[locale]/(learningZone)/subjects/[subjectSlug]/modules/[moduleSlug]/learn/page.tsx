import ReviewModulePageClient from "./ReviewModulePageClient";
import {prisma} from "@/lib/prisma";

// If you're using NextAuth v5 `auth()` export:
import {auth} from "@/lib/auth";
import HeaderSlick, {LearnHeaderSlick} from "@/components/HeaderSlick";
import React from "react"; // adjust path if yours differs

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page() {
    const session = await auth();

    // Prefer DB truth (since session may not include roles yet)
    const userId = (session?.user as any)?.id ?? null;

    let canUnlockAll = false;

    if (userId) {
        const u = await prisma.user.findUnique({
            where: {id: userId},
            select: {roles: true},
        });

        const roles = u?.roles ?? [];
        canUnlockAll = roles.includes("admin") || roles.includes("teacher");
    }

    return <>
        {/*<HeaderSlick slot={<>Hello</>} isBillingStatus={false} brand={process.env.NEXT_PUBLIC_APP_NAME} badge="MVP"*/}
        {/*                            isUser={false} isNav={false}/>*/}

        <ReviewModulePageClient canUnlockAll={canUnlockAll}/></>;
}
