import { ensureGuestId, getActor } from "@/lib/practice/actor";

export async function getActorWithGuest(opts?: { createIfMissing?: boolean }) {
    const actor0 = await getActor();

    if (opts?.createIfMissing === false) {
        return {
            actor: actor0,
            setGuestId: undefined as string | undefined,
        };
    }

    const ensured = ensureGuestId(actor0);

    return {
        actor: ensured.actor,
        setGuestId: ensured.setGuestId,
    };
}