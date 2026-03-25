import { NextResponse } from "next/server";

import { getActor } from "@/lib/practice/actor";
import { claimGuestOnboardingForUser } from "@/lib/onboarding/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
    const actor = await getActor();

    if (!actor.userId) {
        return NextResponse.json(
            { ok: false, error: "User must be authenticated." },
            { status: 401 },
        );
    }

    if (!actor.guestId) {
        return NextResponse.json({
            ok: true,
            claimed: false,
            reason: "No guest onboarding to claim.",
        });
    }

    const claimed = await claimGuestOnboardingForUser({
        guestId: actor.guestId,
        userId: actor.userId,
    });

    return NextResponse.json({
        ok: true,
        claimed: Boolean(claimed),
    });
}