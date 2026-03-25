import { ensureGuestId, getActor } from "@/lib/practice/actor";

export async function resolveActorForPayload(payload: any) {
    const actor0 = await getActor();
    let actor = actor0;
    let setGuestId: string | null = null;

    if (!actor0.userId && !actor0.guestId && payload?.guestId) {
        actor = { ...actor0, guestId: payload.guestId as string };
        setGuestId = actor.guestId ?? null;
    } else {
        const ensured = ensureGuestId(actor0);
        actor = ensured.actor;
        setGuestId = ensured.setGuestId ?? null;
    }

    return { actor, setGuestId };
}

export function isActorMismatch(
    payload: any,
    actor: { userId?: string | null; guestId?: string | null },
) {
    const pUser = payload?.userId ?? null;
    const pGuest = payload?.guestId ?? null;

    if (pUser && pUser !== (actor.userId ?? null)) return true;
    if (pGuest && pGuest !== (actor.guestId ?? null)) return true;
    return false;
}