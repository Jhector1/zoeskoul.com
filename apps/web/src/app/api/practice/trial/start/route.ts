import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachGuestCookie } from "@/lib/practice/actor";
import { rateLimit } from "@/lib/security/ratelimit";
import {
    getClientIp,
    hardenApiResponse,
    readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { buildTrialStartContext } from "@/lib/practice/api/trial/context";
import { handleTrialStart } from "@/lib/practice/api/trial/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    const requestId = crypto.randomUUID();

    const raw = await readJsonSafe(req);

    const built = await buildTrialStartContext({
        prisma,
        req,
        requestId,
        rawBody: raw,
    });

    if (!built.ok) {
        return hardenApiResponse(
            NextResponse.json(built.body, { status: built.statusCode }),
        );
    }

    const { ctx } = built;

    const ip = getClientIp(req);
    const rl = await rateLimit(`practice-trial-start:${ip}`);

    if (!rl.ok) {
        const res = NextResponse.json(
            { message: "Too many requests.", requestId },
            { status: 429 },
        );
        return attachGuestCookie(hardenApiResponse(res), ctx.setGuestId);
    }

    try {
        const out = await handleTrialStart(ctx);

        if (!out.ok) {
            const res = NextResponse.json(out.body, { status: out.statusCode });
            return attachGuestCookie(hardenApiResponse(res), ctx.setGuestId);
        }

        const res = NextResponse.json(out, { status: 200 });
        return attachGuestCookie(hardenApiResponse(res), ctx.setGuestId);
    } catch (err: any) {
        const res = NextResponse.json(
            {
                message: err?.message ?? "Could not start trial session.",
                requestId,
            },
            { status: 400 },
        );
        return attachGuestCookie(hardenApiResponse(res), ctx.setGuestId);
    }
}
