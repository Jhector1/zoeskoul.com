
export const CHECKOUT_ATTEMPT_STORAGE_KEY =
  "zoeskoul.billing.checkoutAttempt.v1";

export const CHECKOUT_ATTEMPT_REUSE_TTL_MS = 80 * 60 * 1000;

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CHECKOUT_SESSION_ID_RE = /^cs_(?:test|live)_[A-Za-z0-9]+$/;

export type CheckoutPlan = "monthly" | "yearly";

export type CheckoutAttemptFingerprintInput = {
  plan: CheckoutPlan;
  useTrial: boolean;
  callbackUrl: string;
};

type StoredCheckoutAttempt = {
  id: string;
  fingerprint: string;
  createdAtMs: number;
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function isCheckoutAttemptId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_RE.test(value.trim());
}

export function isCheckoutSessionId(value: unknown): value is string {
  return typeof value === "string" && CHECKOUT_SESSION_ID_RE.test(value.trim());
}

export function buildStripeCheckoutIdempotencyKey(
  checkoutAttemptId: string,
): string {
  if (!isCheckoutAttemptId(checkoutAttemptId)) {
    throw new Error("Invalid Checkout attempt id");
  }
  return `zoeskoul-checkout:${checkoutAttemptId}`;
}

export function checkoutAttemptFingerprint(
  input: CheckoutAttemptFingerprintInput,
): string {
  return JSON.stringify([
    input.plan,
    input.useTrial,
    String(input.callbackUrl ?? ""),
  ]);
}

function parseStoredCheckoutAttempt(
  raw: string | null,
): StoredCheckoutAttempt | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<StoredCheckoutAttempt>;
    if (
      !isCheckoutAttemptId(value.id) ||
      typeof value.fingerprint !== "string" ||
      typeof value.createdAtMs !== "number" ||
      !Number.isFinite(value.createdAtMs)
    ) {
      return null;
    }

    return {
      id: value.id,
      fingerprint: value.fingerprint,
      createdAtMs: value.createdAtMs,
    };
  } catch {
    return null;
  }
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function browserRandomUuid(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  throw new Error("Secure Checkout attempt generation is unavailable");
}

export function getOrCreateBrowserCheckoutAttempt(
  input: CheckoutAttemptFingerprintInput,
  options: {
    storage?: StorageLike | null;
    nowMs?: number;
    randomUuid?: () => string;
  } = {},
): string {
  const storage =
    options.storage === undefined ? browserStorage() : options.storage;
  const nowMs = options.nowMs ?? Date.now();
  const fingerprint = checkoutAttemptFingerprint(input);

  if (storage) {
    const stored = parseStoredCheckoutAttempt(
      storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY),
    );

    if (
      stored &&
      stored.fingerprint === fingerprint &&
      nowMs >= stored.createdAtMs &&
      nowMs - stored.createdAtMs <= CHECKOUT_ATTEMPT_REUSE_TTL_MS
    ) {
      return stored.id;
    }
  }

  const id = (options.randomUuid ?? browserRandomUuid)();
  if (!isCheckoutAttemptId(id)) {
    throw new Error("Checkout attempt generator returned an invalid UUID");
  }

  if (storage) {
    storage.setItem(
      CHECKOUT_ATTEMPT_STORAGE_KEY,
      JSON.stringify({
        id,
        fingerprint,
        createdAtMs: nowMs,
      } satisfies StoredCheckoutAttempt),
    );
  }

  return id;
}

export function clearBrowserCheckoutAttempt(
  checkoutAttemptId?: string | null,
  options: { storage?: StorageLike | null } = {},
): boolean {
  const storage =
    options.storage === undefined ? browserStorage() : options.storage;
  if (!storage) return false;

  const stored = parseStoredCheckoutAttempt(
    storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY),
  );
  if (!stored) {
    storage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
    return false;
  }

  if (
    checkoutAttemptId &&
    stored.id !== checkoutAttemptId
  ) {
    return false;
  }

  storage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
  return true;
}
