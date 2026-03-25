import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// ✅ Adjust this import to match your NextAuth setup
// If you use `auth()` from NextAuth v5, it's usually exported from "@/auth".
import { auth } from "@/lib/auth";

export type Actor = { userId: string | null; guestId: string | null };

const GUEST_COOKIE = "learnoir_guest";
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function newGuestId() {
  // Node/Edge: crypto.randomUUID exists in modern runtimes
  return `g_${crypto.randomUUID()}`;
}

/**
 * Returns the actor for the current request context:
 * - userId if logged in
 * - else guestId from cookie (creating one if missing)
 *
 * Also returns `setGuestId` when a new guest id must be set in the response cookie.
 */
export async function requireUserOrGuest(): Promise<{
  actor: Actor;
  setGuestId?: string;
}> {
  // 1) Logged-in user?
  const session = await auth().catch(() => null);
  const userId = (session as any)?.user?.id ?? null;
  if (userId) return { actor: { userId, guestId: null } };

  // 2) Guest via cookie
  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value ?? null;

  if (existing) {
    return { actor: { userId: null, guestId: existing } };
  }

  // 3) Mint a new guest
  const guestId = newGuestId();
  return { actor: { userId: null, guestId }, setGuestId: guestId };
}

/**
 * Attach guest cookie (only if setGuestId is provided).
 * Use this right before returning the response.
 */
export function attachGuestCookie<T extends NextResponse>(
  res: T,
  setGuestId?: string
): T {
  if (!setGuestId) return res;

  res.cookies.set(GUEST_COOKIE, setGuestId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });

  return res;
}
