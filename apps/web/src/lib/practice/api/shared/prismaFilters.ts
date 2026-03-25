import type { Actor } from "@/lib/practice/actor";

export function buildActorOrWhere(actor: Actor) {
    const out: Array<{ userId: string } | { guestId: string }> = [];

    if (actor.userId) out.push({ userId: actor.userId });
    if (actor.guestId) out.push({ guestId: actor.guestId });

    return out;
}
