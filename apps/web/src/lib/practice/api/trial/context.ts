import type { PrismaClient } from "@prisma/client";
import { TrialStartBodySchema } from "./schemas";
import type { TrialStartContext } from "./types";
import { getTrialActor } from "./services/trialActor.service";

export async function buildTrialStartContext(args: {
    prisma: PrismaClient;
    req: Request;
    requestId: string;
    rawBody: unknown;
}): Promise<
    | { ok: true; ctx: TrialStartContext }
    | { ok: false; statusCode: number; body: { message: string; requestId: string } }
> {
    const parsed = TrialStartBodySchema.safeParse(args.rawBody);

    if (!parsed.success) {
        return {
            ok: false,
            statusCode: 400,
            body: {
                message: "Invalid request body.",
                requestId: args.requestId,
            },
        };
    }

    const { actor, setGuestId } = await getTrialActor();

    return {
        ok: true,
        ctx: {
            prisma: args.prisma,
            req: args.req,
            requestId: args.requestId,
            actor,
            setGuestId,
            body: parsed.data,
        },
    };
}
