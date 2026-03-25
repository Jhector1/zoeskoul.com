// src/lib/practice/topicSlugs.ts
import type { GenKey, TopicSlug } from "./types";

/**
 * Map generator keys (engine) -> DB slugs (PracticeTopic.slug)
 * Keep this aligned with prisma/seed/data.ts TOPICS values.
 */
export const GENKEY_TO_DB: Record<GenKey, TopicSlug> = {

  // -----------------------------
  python_part1: "py0.python_part1",

};

/**
 * Extract GenKey from either:
 * - "vectors_part2"
 * - "m0.vectors_part2"
 */
export function genKeyFromAnySlug(s: string): GenKey | null {
  const raw = String(s || "").trim();
  if (!raw) return null;

  const maybe = (raw.includes(".") ? raw.split(".").pop() : raw) as GenKey;
  return maybe in GENKEY_TO_DB ? maybe : null;
}

/**
 * Convert any incoming slug ("vectors", "m0.vectors") to the DB slug.
 * If it already looks namespaced (has '.'), we assume it's DB slug already.
 */
export function toDbTopicSlug(s: string): TopicSlug {
  const raw = String(s || "").trim();
  if (!raw) return raw as TopicSlug;

  if (raw.includes(".")) return raw as TopicSlug; // already DB-style

  const gk = genKeyFromAnySlug(raw);
  return (gk ? GENKEY_TO_DB[gk] : raw) as TopicSlug; // unknown stays as-is
}