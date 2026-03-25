import { ensureGuestId, getActor } from "@/lib/practice/actor";

export async function getTrialActor() {
    const actor0 = await getActor();
    const ensured = ensureGuestId(actor0);

    return {
        actor: ensured.actor,
        setGuestId: ensured.setGuestId ?? null,
    };
}
