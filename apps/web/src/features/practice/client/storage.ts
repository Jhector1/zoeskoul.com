import type { MutableRefObject } from "react";
import type { QItem, TopicValue } from "@/lib/practice/uiTypes";
import type { Difficulty } from "@/lib/practice/types";
import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
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

export function buildSavedStateLookupKeys(args: {
  subjectSlug: string;
  moduleSlug: string;
  section: string | null;
  topic: TopicValue | string;
  difficulty: Difficulty | "all" | string;
  n: number;
  sessionId: string | null;
}) {
  if (args.sessionId) {
    return [`practice:v${STORAGE_VERSION}:session:${args.sessionId}`];
  }

  return [storageKeyV6(args), storageKeyV6Legacy(args)];
}

export function resolveHydrationSessionId(args: {
  authoritativeSessionId?: boolean;
  initialSessionId?: string | null;
  sessionIdParam?: string | null;
  rememberedSessionId?: string | null;
}) {
  const initialSessionId = String(args.initialSessionId ?? "").trim() || null;
  const sessionIdParam = String(args.sessionIdParam ?? "").trim() || null;
  const rememberedSessionId =
    String(args.rememberedSessionId ?? "").trim() || null;

  if (args.authoritativeSessionId) {
    return initialSessionId;
  }

  return sessionIdParam ?? initialSessionId ?? rememberedSessionId;
}

export function isSavedRunCompatible(args: {
  expectedExperienceMode?: PracticeExperienceMode | null;
  savedRunMode?: unknown;
}) {
  const expected = args.expectedExperienceMode ?? null;
  if (!expected) return true;

  const saved =
    typeof args.savedRunMode === "string" && args.savedRunMode.trim()
      ? args.savedRunMode.trim()
      : null;

  // A state written before run metadata arrived is safe to hydrate because it
  // is still scoped by the exact session id. A conflicting explicit mode is
  // never safe to promote into the current experience.
  return saved == null || saved === expected;
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
  const keysToTry = buildSavedStateLookupKeys(args);

  const canonical = storageKeyV6(args);

  for (const k of keysToTry) {
    const payload = tryParseV(sessionStorage.getItem(k));
    if (payload) {
      return { key: k, payload, canonicalKey: canonical };
    }
  }

  if (args.sessionId) return null;

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
  authoritativeSessionId?: boolean;
  initialSessionId?: string | null;
}) {
  const initialSessionId = String(args.initialSessionId ?? "").trim() || null;
  const stateSessionId = String(args.sessionId ?? "").trim() || null;
  const resolvedSessionId =
    String(args.resolvedSessionIdRef.current ?? "").trim() || null;

  // Server-started experiences pass an authoritative session id. A URL left
  // behind by a previously visited assignment must never replace that id.
  if (args.authoritativeSessionId) {
    return initialSessionId ?? stateSessionId ?? resolvedSessionId;
  }

  if (typeof window !== "undefined") {
    const fromUrl =
      String(
        new URLSearchParams(window.location.search).get("sessionId") ?? "",
      ).trim() || null;
    if (fromUrl) return fromUrl;
  }

  return stateSessionId ?? resolvedSessionId;
}
