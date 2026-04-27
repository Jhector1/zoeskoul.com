import type { PrismaClient } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import { actorKeyOf } from "@/lib/practice/actor";
import { getLearnerGamificationSummary } from "./summary";

export async function getGamificationSummaryForActor(
    prisma: PrismaClient,
    actor: Actor,
) {
    return getLearnerGamificationSummary(prisma, actorKeyOf(actor));
}
