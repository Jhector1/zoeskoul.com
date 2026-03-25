import { NextResponse } from "next/server";

import {
    getActor,
    ensureGuestId,
    attachGuestCookie,
} from "@/lib/practice/actor";
import { SaveOnboardingSchema } from "@/lib/onboarding/schema";
import {
    getOnboardingProfile,
    upsertOnboardingProfile,
} from "@/lib/onboarding/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const actor = await getActor();
    const { actor: ensuredActor, setGuestId } = ensureGuestId(actor);

    const profile = await getOnboardingProfile(ensuredActor);

    const res = NextResponse.json({
        ok: true,
        profile: profile
            ? {
                preferredLanguage: profile.preferredLanguage ?? "",
                level: profile.level ?? "",
                studyTime: profile.studyTime ?? "",
                completed: Boolean(profile.completedAt),
                skipped: Boolean(profile.skippedAt),
                learningInterests: profile.interests
                    .map((x) => x.subject?.slug)
                    .filter(Boolean),
            }
            : null,
    });

    return attachGuestCookie(res, setGuestId);
}

export async function POST(req: Request) {
    const actor = await getActor();
    const { actor: ensuredActor, setGuestId } = ensureGuestId(actor);

    const json = await req.json().catch(() => null);
    const parsed = SaveOnboardingSchema.safeParse(json);

    if (!parsed.success) {
        const res = NextResponse.json(
            { ok: false, error: "Invalid onboarding payload." },
            { status: 400 },
        );
        return attachGuestCookie(res, setGuestId);
    }

    const profile = await upsertOnboardingProfile(ensuredActor, parsed.data);

    const res = NextResponse.json({
        ok: true,
        profileId: profile.id,
    });

    return attachGuestCookie(res, setGuestId);
}