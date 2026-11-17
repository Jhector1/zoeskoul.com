import { createHash, randomBytes } from "node:crypto";

const ACTOR = /^u:[a-f0-9]{64}$/;
const PROJECT = /^[A-Za-z0-9_-]{1,128}$/;
const PREVIEW = /^preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const TTL_MS = 20_000;
const MAX_TICKETS = 128;

export type DevelopmentHmrIdentity = Readonly<{
  ownerKey: string;
  buildProjectId: string;
  previewId: string;
  sourceVersion: number;
}>;
export type DevelopmentHmrClaims = DevelopmentHmrIdentity & Readonly<{
  origin: string;
  expiresAt: number;
}>;

export class DevelopmentHmrTicketError extends Error {
  constructor() { super("Development preview HMR unavailable."); }
}

export function validDevelopmentHmrIdentity(value: DevelopmentHmrIdentity): boolean {
  return !!value && ACTOR.test(value.ownerKey) && PROJECT.test(value.buildProjectId) &&
    PREVIEW.test(value.previewId) && Number.isSafeInteger(value.sourceVersion) &&
    value.sourceVersion >= 1;
}

/** The browser's Origin must match a deployment-configured exact origin.
 * Opaque-origin preview iframes are not enabled by this phase. The browser
 * transport will need a separately reviewed strategy for sandboxed iframes.
 */
export function allowedDevelopmentHmrOrigin(
  origin: unknown,
  allowedOrigins: readonly string[],
): origin is string {
  if (typeof origin !== "string" || origin.length > 256 || origin === "null") return false;
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  if (url.origin !== origin || url.username || url.password || url.search || url.hash ||
      url.pathname !== "/" || (url.protocol !== "https:" &&
      !(url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))))
    return false;
  return allowedOrigins.some(candidate => candidate === origin);
}

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Tickets are one-use, held only in the dedicated Runner process, and never
 * stored as plaintext. Service authentication protects issuance; consumption
 * binds the browser's Origin and exact immutable lease identity. */
export class DevelopmentHmrTicketStore {
  private readonly pending = new Map<string, DevelopmentHmrClaims>();

  issue(identity: DevelopmentHmrIdentity, origin: string, now = Date.now()): string {
    if (!validDevelopmentHmrIdentity(identity) || !origin || origin.length > 256 ||
        !Number.isSafeInteger(now) || now < 0)
      throw new DevelopmentHmrTicketError();
    for (const [hash, claims] of this.pending) {
      if (claims.expiresAt <= now) this.pending.delete(hash);
    }
    if (this.pending.size >= MAX_TICKETS) throw new DevelopmentHmrTicketError();
    const token = randomBytes(32).toString("base64url");
    this.pending.set(digest(token), { ...identity, origin, expiresAt: now + TTL_MS });
    return token;
  }

  consume(token: unknown, previewId: string, origin: unknown, now = Date.now()): DevelopmentHmrIdentity {
    if (typeof token !== "string" || !TOKEN.test(token) || typeof origin !== "string" ||
        !Number.isSafeInteger(now) || now < 0)
      throw new DevelopmentHmrTicketError();
    const hash = digest(token);
    const claims = this.pending.get(hash);
    // Single-use is atomic even when an attacker has a stolen token but the
    // wrong Origin: do not leave that token reusable after an attempted use.
    this.pending.delete(hash);
    if (!claims || claims.expiresAt <= now || claims.origin !== origin ||
        claims.previewId !== previewId || !validDevelopmentHmrIdentity(claims))
      throw new DevelopmentHmrTicketError();
    return { ownerKey: claims.ownerKey, buildProjectId: claims.buildProjectId,
      previewId: claims.previewId, sourceVersion: claims.sourceVersion };
  }

  /** Test-only introspection without exposing tokens or identities. */
  get pendingCount(): number { return this.pending.size; }
}

export const developmentHmrTickets = new DevelopmentHmrTicketStore();

/** Accept only native Vite ping from the untrusted iframe. */
export function validDevelopmentHmrClientMessage(raw: string): boolean {
  if (Buffer.byteLength(raw, "utf8") > 4096) return false;
  try {
    const obj: unknown = JSON.parse(raw);
    return !!obj && typeof obj === "object" && !Array.isArray(obj) &&
      Object.keys(obj).length === 1 &&
      (obj as { type?: unknown }).type === "ping";
  } catch { return false; }
}
