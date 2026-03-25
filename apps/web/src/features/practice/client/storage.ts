import type { MutableRefObject } from "react";
import type { QItem, TopicValue } from "@/lib/practice/uiTypes";
import type { Difficulty } from "@/lib/practice/types";
import { STORAGE_VERSION } from "./constants";

/** canonical: no n in key (recommended) */
export function storageKeyV6(args: {
  subjectSlug: string;
  moduleSlug: string;
  section: string | null;
  topic: TopicValue | string;
  difficulty: Difficulty | "all" | string;
}) {
  const { subjectSlug, moduleSlug, section, topic, difficulty } = args;

  return `practice:v${STORAGE_VERSION}:${subjectSlug}:${moduleSlug}:${section ?? "no-section"}:${String(topic)}:${String(difficulty)}`;
}

/** legacy: includes n */
export function storageKeyV6Legacy(args: {
  subjectSlug: string;
  moduleSlug: string;
  section: string | null;
  topic: TopicValue | string;
  difficulty: Difficulty | "all" | string;
  n: number;
}) {
  const { subjectSlug, moduleSlug, section, topic, difficulty, n } = args;

  return `practice:v${STORAGE_VERSION}:${subjectSlug}:${moduleSlug}:${section ?? "no-section"}:${String(topic)}:${String(difficulty)}:n=${n}`;
}

export function storageKeyForState(args: {
  subjectSlug: string;
  moduleSlug: string;
  section: string | null;
  topic: TopicValue | string;
  difficulty: Difficulty | "all" | string;
  n: number;
  sessionId: string | null;
}) {
  if (args.sessionId) {
    return `practice:v${STORAGE_VERSION}:session:${args.sessionId}`;
  }

  return storageKeyV6(args);
}

export function lastSessionKey(subjectSlug: string, moduleSlug: string) {
  return `practice:v${STORAGE_VERSION}:lastSession:${subjectSlug}:${moduleSlug}`;
}

/* ---------------- Expiry pruning (safe no-op if not JWT-like) ---------------- */

function base64UrlToJson(part: string) {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const b64p = b64 + pad;

  const atobFn =
      typeof globalThis.atob === "function"
          ? globalThis.atob
          : (s: string) => Buffer.from(s, "base64").toString("binary");

  const txt = atobFn(b64p);
  return JSON.parse(txt);
}

function isExpiredKey(k: unknown) {
  if (typeof k !== "string") return false;

  const parts = k.split(".");
  const payloadPart =
      parts.length >= 3 ? parts[1] : parts.length >= 2 ? parts[0] : null;

  if (!payloadPart) return false;

  try {
    const json = base64UrlToJson(payloadPart);
    const exp = Number(json?.exp);
    if (!Number.isFinite(exp)) return false;

    const now = Math.floor(Date.now() / 1000);
    return exp <= now;
  } catch {
    return false;
  }
}

export function pruneExpiredStack(stack: QItem[]) {
  const arr = Array.isArray(stack) ? stack : [];

  return arr.filter((q) => {
    if (!q) return false;

    const hasProgress =
        Boolean(q.submitted) || Boolean(q.revealed) || Boolean(q.result);

    if (hasProgress) return true;

    return !isExpiredKey((q as any).key);
  });
}

function tryParseV(raw: string | null) {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v === STORAGE_VERSION) return parsed;
  } catch {}

  return null;
}

function findBestLegacyAnyN(args: {
  subjectSlug: string;
  moduleSlug: string;
  section: string | null;
  topic: TopicValue | string;
  difficulty: Difficulty | "all" | string;
}) {
  const prefix =
      `practice:v${STORAGE_VERSION}:` +
      `${args.subjectSlug}:${args.moduleSlug}:${args.section ?? "no-section"}:` +
      `${String(args.topic)}:${String(args.difficulty)}:n=`;

  let bestKey: string | null = null;
  let bestPayload: any = null;
  let bestSavedAt = -1;

  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;

      const payload = tryParseV(sessionStorage.getItem(k));
      if (!payload) continue;

      const savedAt = Number(payload?.savedAt ?? 0);
      if (savedAt >= bestSavedAt) {
        bestSavedAt = savedAt;
        bestKey = k;
        bestPayload = payload;
      }
    }
  } catch {}

  return bestKey && bestPayload
      ? { key: bestKey, payload: bestPayload }
      : null;
}

export function loadSavedState(args: {
  subjectSlug: string;
  moduleSlug: string;
  section: string | null;
  topic: TopicValue | string;
  difficulty: Difficulty | "all" | string;
  n: number;
  sessionId: string | null;
}) {
  const keysToTry: string[] = [];

  if (args.sessionId) {
    keysToTry.push(`practice:v${STORAGE_VERSION}:session:${args.sessionId}`);
  }

  const canonical = storageKeyV6(args);
  keysToTry.push(canonical);

  const legacyGuess = storageKeyV6Legacy(args);
  keysToTry.push(legacyGuess);

  for (const k of keysToTry) {
    const payload = tryParseV(sessionStorage.getItem(k));
    if (payload) {
      return { key: k, payload, canonicalKey: canonical };
    }
  }

  const bestLegacy = findBestLegacyAnyN({
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    section: args.section,
    topic: args.topic,
    difficulty: args.difficulty,
  });

  if (bestLegacy) {
    return {
      key: bestLegacy.key,
      payload: bestLegacy.payload,
      canonicalKey: canonical,
    };
  }

  return null;
}

export function readReturnUrlFromSearchParams(sp: URLSearchParams): string | null {
  const raw =
      sp.get("returnTo") ||
      sp.get("callback") ||
      sp.get("callbackUrl") ||
      sp.get("returnUrl") ||
      null;

  if (!raw) return null;

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function getEffectiveSid(args: {
  sessionId: string | null;
  resolvedSessionIdRef: MutableRefObject<string | null>;
}) {
  if (typeof window !== "undefined") {
    const fromUrl = new URLSearchParams(window.location.search).get("sessionId");
    if (fromUrl) return fromUrl;
  }

  return args.sessionId ?? args.resolvedSessionIdRef.current ?? null;
}