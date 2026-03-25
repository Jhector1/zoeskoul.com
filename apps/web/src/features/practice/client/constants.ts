// src/features/practice/client/constants.ts
export const STORAGE_VERSION = 6 as const;
export const SESSION_DEFAULT = 10 as const;

export function scorePct(correct: number, answered: number) {
  if (!answered || answered <= 0) return 0;
  return Math.round((correct / answered) * 100);
}

// // src/features/practice/client/urls.ts
// export function readReturnUrlFromSearchParams(sp: URLSearchParams): string | null {
//   const raw =
//     sp.get("returnTo") ||
//     sp.get("callback") ||
//     sp.get("callbackUrl") ||
//     sp.get("returnUrl") ||
//     null;

//   if (!raw) return null;

//   // if someone already passed a decoded URL, decodeURIComponent can throw,
//   // so guard it.
//   try {
//     return decodeURIComponent(raw);
//   } catch {
//     return raw;
//   }
// }





// /* -------------------------------------------
//    Expiring old items (optional, safe)
//    ------------------------------------------- */

// /**
//  * Decode a base64url segment into JSON.
//  * Works in browser; includes a Node/test fallback.
//  */
// function base64UrlToJson(part: string) {
//   const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
//   const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
//   const b64p = b64 + pad;

//   const atobFn =
//     typeof globalThis.atob === "function"
//       ? globalThis.atob
//       : (s: string) => Buffer.from(s, "base64").toString("binary");

//   const txt = atobFn(b64p);
//   return JSON.parse(txt);
// }

// /**
//  * Supports:
//  * - "payload.sig"          -> payload in parts[0]
//  * - "header.payload.sig"   -> payload in parts[1] (JWT-style)
//  *
//  * If there is no parsable exp, we DO NOT expire it.
//  */
// function isExpiredKey(k: unknown) {
//   if (typeof k !== "string") return false;

//   const parts = k.split(".");
//   const payloadPart =
//     parts.length >= 3 ? parts[1] : parts.length >= 2 ? parts[0] : null;

//   if (!payloadPart) return false;

//   try {
//     const json = base64UrlToJson(payloadPart);
//     const exp = Number(json?.exp);
//     if (!Number.isFinite(exp)) return false;

//     const now = Math.floor(Date.now() / 1000);
//     return exp <= now;
//   } catch {
//     return false;
//   }
// }

// /**
//  * Removes items whose key has an exp that is in the past.
//  * If your keys don't embed exp, this becomes a no-op (keeps everything).
//  */
// export function pruneExpiredStack<T extends { key?: unknown }>(stack: T[]) {
//   const arr = Array.isArray(stack) ? stack : [];
//   return arr.filter((q) => !isExpiredKey(q?.key));
// }









// // // src/features/practice/client/storage.ts
// // export const STORAGE_VERSION = 6 as const;
// // export const SESSION_DEFAULT = 10 as const;

// // ✅ NEW canonical (recommended): do NOT include n in the key
// export function storageKeyV6(args: {
//   subjectSlug: string;
//   moduleSlug: string;
//   section: string | null;
//   topic: string;       // TopicSlug | "all"
//   difficulty: string;  // Difficulty | "all"
// }) {
//   const { subjectSlug, moduleSlug, section, topic, difficulty } = args;
//   return `practice:v${STORAGE_VERSION}:${subjectSlug}:${moduleSlug}:${section ?? "no-section"}:${topic}:${difficulty}`;
// }

// // ✅ LEGACY (your old format): includes n
// export function storageKeyV6Legacy(args: {
//   subjectSlug: string;
//   moduleSlug: string;
//   section: string | null;
//   topic: string;
//   difficulty: string;
//   n: number;
// }) {
//   const { subjectSlug, moduleSlug, section, topic, difficulty, n } = args;
//   return `practice:v${STORAGE_VERSION}:${subjectSlug}:${moduleSlug}:${section ?? "no-section"}:${topic}:${difficulty}:n=${n}`;
// }

// export function storageKeyForState(args: {
//   subjectSlug: string;
//   moduleSlug: string;
//   section: string | null;
//   topic: string;
//   difficulty: string;
//   n: number;
//   sessionId: string | null;
// }) {
//   if (args.sessionId) return `practice:v${STORAGE_VERSION}:session:${args.sessionId}`;
//   // ✅ canonical for stateless runs
//   return storageKeyV6(args);
// }

// export function loadSavedState(args: {
//   subjectSlug: string;
//   moduleSlug: string;
//   section: string | null;
//   topic: string;
//   difficulty: string;
//   n: number;
//   sessionId: string | null;
// }) {
//   // try session key first if present
//   const keysToTry: string[] = [];
//   if (args.sessionId) keysToTry.push(`practice:v${STORAGE_VERSION}:session:${args.sessionId}`);

//   // then canonical
//   const canonical = storageKeyV6(args);
//   keysToTry.push(canonical);

//   // then legacy (with n)
//   keysToTry.push(storageKeyV6Legacy(args));

//   for (const k of keysToTry) {
//     const raw = sessionStorage.getItem(k);
//     if (!raw) continue;
//     try {
//       const parsed = JSON.parse(raw);
//       if (parsed?.v === STORAGE_VERSION) {
//         return { key: k, payload: parsed, canonicalKey: canonical };
//       }
//     } catch {
//       // ignore
//     }
//   }
//   return null;
// }
