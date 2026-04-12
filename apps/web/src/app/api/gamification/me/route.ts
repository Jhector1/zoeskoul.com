import { prisma } from "@/lib/prisma";
import {
    ensureGuestId,
    getActor,
} from "@/lib/practice/actor";
import { bodyJsonWithGuestCookie } from "@/lib/practice/api/shared/http";
import { getGamificationSummaryForActor } from "@/lib/gamification/getSummaryForActor";

export async function GET() {
    const actor0 = await getActor();
    const { actor, setGuestId } = ensureGuestId(actor0);

    const summary = await getGamificationSummaryForActor(prisma, actor);

    return bodyJsonWithGuestCookie(
        {
            summary,
        },
        200,
        setGuestId,
    );
}