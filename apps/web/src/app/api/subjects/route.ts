import { NextResponse } from "next/server";
import { getOnboardingSubjects } from "@/lib/onboarding/getOnboardingSubjects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const subjects = await getOnboardingSubjects();

    return NextResponse.json({
        ok: true,
        subjects,
    });
}