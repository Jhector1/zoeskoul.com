export type Actor = {
  userId: string | null;
  guestId: string | null;
};

export async function getActor(): Promise<Actor> {
  return {
    userId: null,
    guestId: null,
  };
}

export function ensureGuestId(
  actor: Actor,
): {
  actor: Actor;
  setGuestId?: string;
} {
  return { actor };
}

export function attachGuestCookie<T>(
  response: T,
  _setGuestId?: string | null,
): T {
  return response;
}

export function actorKeyOf(actor: Actor): string {
  if (actor.userId) return `u:${actor.userId}`;
  if (actor.guestId) return `g:${actor.guestId}`;
  return "g:missing";
}
