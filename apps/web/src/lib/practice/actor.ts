import "server-only";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export type Actor = { userId: string | null; guestId: string | null };

const SECURE_GUEST_COOKIE = "__Host-guest";
const DEV_GUEST_COOKIE = "guest";
const ONE_YEAR = 60 * 60 * 24 * 365;

/* -------------------------------------------------------------------------- */
/* cookie mode                                                                */
/* -------------------------------------------------------------------------- */

function shouldUseSecureGuestCookie() {
  return process.env.NODE_ENV === "production";
}

function getGuestCookieName() {
  return shouldUseSecureGuestCookie() ? SECURE_GUEST_COOKIE : DEV_GUEST_COOKIE;
}

function getReadableGuestCookieNames() {
  // Read both so env switches do not strand old sessions unexpectedly.
  return [SECURE_GUEST_COOKIE, DEV_GUEST_COOKIE];
}

/* -------------------------------------------------------------------------- */
/* signing                                                                    */
/* -------------------------------------------------------------------------- */

function getGuestSecrets(): string[] {
  const cur = process.env.GUEST_COOKIE_SECRET;
  const old = process.env.GUEST_COOKIE_SECRET_OLD;

  const secrets = [cur, old].filter(Boolean) as string[];

  if (secrets.length === 0) {
    throw new Error("Missing GUEST_COOKIE_SECRET.");
  }

  return secrets;
}

function b64url(buf: Buffer) {
  return buf
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
}

function signGuestId(id: string, secret: string) {
  const mac = createHmac("sha256", secret).update(id, "utf8").digest();
  return b64url(mac);
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function encodeGuestCookie(id: string) {
  const secrets = getGuestSecrets();
  const sig = signGuestId(id, secrets[0]);
  return `${id}.${sig}`;
}

function decodeGuestCookie(value: string | undefined | null): string | null {
  if (!value) return null;

  const secrets = getGuestSecrets();

  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;

  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);

  if (id.length < 10 || sig.length < 20) return null;

  for (const secret of secrets) {
    const expected = signGuestId(id, secret);
    if (safeEqual(sig, expected)) return id;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* resolve authenticated user to INTERNAL Prisma User.id                      */
/* -------------------------------------------------------------------------- */

async function resolveDbUserIdFromSession(): Promise<string | null> {
  const session = await auth();
  const rawId = (session?.user as any)?.id ?? null;
  const email = session?.user?.email ?? null;

  // Best case: session.user.id is already Prisma User.id
  if (rawId) {
    const byId = await prisma.user.findUnique({
      where: { id: rawId },
      select: { id: true },
    });
    if (byId) return byId.id;
  }

  // Fallback: resolve by email if present
  if (email) {
    const byEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (byEmail) return byEmail.id;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* actor                                                                      */
/* -------------------------------------------------------------------------- */

export async function getActor(): Promise<Actor> {
  const userId = await resolveDbUserIdFromSession();
  const jar = await cookies();

  let guestId: string | null = null;

  for (const cookieName of getReadableGuestCookieNames()) {
    const raw = jar.get(cookieName)?.value ?? null;
    guestId = decodeGuestCookie(raw);
    if (guestId) break;
  }

  return { userId, guestId };
}

/**
 * Returns:
 * - { actor } if user is logged in OR guestId already exists
 * - { actor, setGuestId } if we created a new guest id
 */
export function ensureGuestId(
    actor: Actor,
): { actor: Actor; setGuestId?: string } {
  if (actor.userId) return { actor };
  if (actor.guestId) return { actor };

  const newId = crypto.randomUUID();
  return { actor: { ...actor, guestId: newId }, setGuestId: newId };
}

export function attachGuestCookie(
    res: NextResponse,
    setGuestId?: string | null,
) {
  if (setGuestId) {
    res.cookies.set(getGuestCookieName(), encodeGuestCookie(setGuestId), {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureGuestCookie(),
      path: "/",
      maxAge: ONE_YEAR,
    });
  }

  return res;
}

/* -------------------------------------------------------------------------- */
/* hashing / rate-limit actor keys                                            */
/* -------------------------------------------------------------------------- */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function actorKeyOf(actor: Actor): string {
  if (actor.userId) return `u:${sha(actor.userId)}`;
  if (actor.guestId) return `g:${sha(actor.guestId)}`;
  return "g:missing";
}


