// src/lib/practice/catalog.ts
// Lightweight helpers used by the API route.
// No topic/archetype hardcoding here either.

import { makeRng } from "../generator/shared/rng";
import type { RNG } from "../generator/shared/rng";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export function pick<T>(arr: readonly T[], rng?: RNG): T {
  if (!arr.length) throw new Error("pick() on empty array");
  if (rng) return rng.pick(arr);
  return arr[Math.floor(Math.random() * arr.length)];
}

// src/lib/practice/catalog.ts
export function rngFromActor(args: {
  userId?: string | null;
  guestId?: string | null;
  sessionId?: string | null;
  salt?: string;
}) {
  // ✅ identity: user wins (stable across devices)
  const ident = args.userId
      ? `u:${args.userId}`
      : args.guestId
          ? `g:${args.guestId}`
          : "";

  const seedParts = [
    ident,
    args.sessionId ? `s:${args.sessionId}` : "",
    args.salt ? `salt:${args.salt}` : "",
  ].filter(Boolean);

  // If totally anonymous (should be rare since guests get guestId), add entropy.
  const seed = seedParts.length ? seedParts.join("|") : `anon:${Date.now()}:${Math.random()}`;

  return makeRng(seed);
}
