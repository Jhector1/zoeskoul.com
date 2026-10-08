import { NextResponse } from "next/server";

import { getActor } from "@/lib/practice/actor";
import { SaveOnboardingSchema } from "@/lib/onboarding/schema";
import {
    getOnboardingProfile,
    onboardingStatusFromProfile,
    upsertOnboardingProfile,
} from "@/lib/onboarding/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const actor = await getActor();

    if (!actor.userId) {
        return NextResponse.json(
            { ok: false, error: "Authentication required." },
            { status: 401 },
        );
    }

    const profile = await getOnboardingProfile(actor);

    return NextResponse.json({
        ok: true,
        status: onboardingStatusFromProfile(profile),
        profile: profile
            ? {
                version: profile.version,
                useMode: profile.useMode ?? "",
                learnerAffiliation: profile.learnerAffiliation ?? "",
                teacherAffiliation: profile.teacherAffiliation ?? "",
                learnerDepartments: profile.departments
                    .filter((item) => item.context === "learner")
                    .map((item) => item.departmentKey),
                teacherDepartments: profile.departments
                    .filter((item) => item.context === "teacher")
                    .map((item) => item.departmentKey),
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
}

export async function POST(req: Request) {
    const actor = await getActor();

    if (!actor.userId) {
        return NextResponse.json(
            { ok: false, error: "Authentication required." },
            { status: 401 },
        );
    }

    const json = await req.json().catch(() => null);
    const parsed = SaveOnboardingSchema.safeParse(json);

    if (!parsed.success) {
        return NextResponse.json(
            { ok: false, error: "Invalid onboarding payload." },
            { status: 400 },
        );
    }

    const profile = await upsertOnboardingProfile(actor, parsed.data);

    return NextResponse.json({
        ok: true,
        profileId: profile.id,
    });
}
