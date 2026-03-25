import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    getActor,
    ensureGuestId,
    attachGuestCookie,
    actorKeyOf,
} from "@/lib/practice/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: any, status = 200, setGuestId?: string | null) {
    const res = NextResponse.json(body, { status });
    return attachGuestCookie(res, setGuestId);
}

export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ subjectSlug: string }> },
) {
    const { subjectSlug } = await ctx.params;
    const slug = decodeURIComponent(subjectSlug);

    const subject = await prisma.practiceSubject.findUnique({
        where: { slug },
        select: { id: true, slug: true },
    });

    if (!subject) {
        return json({ message: "Subject not found" }, 404);
    }

    const actor0 = await getActor();
    const ensured = ensureGuestId(actor0);
    const actor = ensured.actor;
    const setGuestId = ensured.setGuestId;

    const actorKey = actorKeyOf(actor);

    // defensive check: only write FK if user actually exists
    let safeUserId: string | null = null;

    if (actor.userId) {
        const dbUser = await prisma.user.findUnique({
            where: { id: actor.userId },
            select: { id: true },
        });
        safeUserId = dbUser?.id ?? null;
    }

    await prisma.subjectEnrollment.upsert({
        where: {
            actorKey_subjectId: {
                actorKey,
                subjectId: subject.id,
            },
        },
        create: {
            actorKey,
            userId: safeUserId,
            subjectId: subject.id,
            source: "self",
            lastSeenAt: new Date(),
            status: "enrolled",
        },
        update: {
            lastSeenAt: new Date(),
            status: "enrolled",
            archivedAt: null,
            ...(safeUserId ? { userId: safeUserId } : {}),
        },
    });

    const now = new Date();

    const hasAccess = await prisma.subjectAccessGrant.findFirst({
        where: {
            actorKey,
            subjectId: subject.id,
            revokedAt: null,
            AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
        },
        select: { id: true },
    });

    return json({ ok: true, hasAccess: !!hasAccess }, 200, setGuestId);
}