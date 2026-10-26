/**
 * Shared, dependency-free credit ACCOUNTING primitives for the platform server.
 * Financial writers retain their existing database locks, transactions, Stripe
 * verification, idempotency keys and product-specific pricing/settlement rules.
 * Never convert one domain's units to another's.
 */
export const CREDIT_DOMAINS = {
  tutoring: "tutoring_minutes",
  builder: "zoebuild_ai_units",
} as const;
export type CreditDomain = typeof CREDIT_DOMAINS[keyof typeof CREDIT_DOMAINS];
export type CreditQuantity = bigint | number;

export class CreditAccountingInvariantError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CreditAccountingInvariantError";
  }
}

function integer(value: CreditQuantity, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value)) {
    throw new CreditAccountingInvariantError(`UNSAFE_${label}`);
  }
  return BigInt(value);
}

/**
 * Domain-scoped credit balance projection. Holds are pending refunds, NOT
 * reservations: reservations have already left the available balance.
 * The caller must read all amounts for ONE user and ONE credit domain.
 */
export function projectCreditAccount(input: Readonly<{
  domain: CreditDomain;
  available: CreditQuantity;
  reserved: CreditQuantity;
  pendingHolds?: CreditQuantity;
}>) {
  const available = integer(input.available, "AVAILABLE");
  const reserved = integer(input.reserved, "RESERVED");
  const pendingHolds = integer(input.pendingHolds ?? 0, "HOLDS");
  if (reserved < 0n || pendingHolds < 0n || available < 0n || pendingHolds > available) {
    throw new CreditAccountingInvariantError("INVALID_CREDIT_BALANCE");
  }
  const spendable = available - pendingHolds;
  return {domain: input.domain, available: spendable, reserved,
    total: spendable + reserved} as const;
}

/** The legacy tutoring wire contract is integer minutes, never fractional. */
export function projectTutoringMinuteBalance(input: Readonly<{
  availableMinutesDelta: number | null;
  reservedMinutesDelta: number | null;
  heldRefundMinutes: number | null;
}>) {
  const snapshot = projectCreditAccount({domain: CREDIT_DOMAINS.tutoring,
    available: input.availableMinutesDelta ?? 0,
    reserved: input.reservedMinutesDelta ?? 0,
    pendingHolds: input.heldRefundMinutes ?? 0});
  for (const value of [snapshot.available, snapshot.reserved, snapshot.total]) {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new CreditAccountingInvariantError("UNSAFE_TUTORING_MINUTES");
    }
  }
  return {availableMinutes: Number(snapshot.available),
    reservedMinutes: Number(snapshot.reserved),
    totalMinutes: Number(snapshot.total)} as const;
}

export type AiCreditBalanceLot = Readonly<{
  kind: "subscription" | "purchased";
  availableUnits: bigint;
  reservedUnits: bigint;
  expiresAt: Date | null;
}>;

/** AI lots retain separate funding sources and expiration semantics. */
export function projectBuilderCreditLotBalance(lots: readonly AiCreditBalanceLot[], now: Date) {
  if (!Number.isFinite(now.getTime())) {
    throw new CreditAccountingInvariantError("INVALID_NOW");
  }
  let subscription = 0n, purchased = 0n, reserved = 0n;
  for (const lot of lots) {
    if (lot.kind !== "subscription" && lot.kind !== "purchased") {
      throw new CreditAccountingInvariantError("INVALID_CREDIT_LOT_KIND");
    }
    const units = integer(lot.availableUnits, "LOT_AVAILABLE");
    const held = integer(lot.reservedUnits, "LOT_RESERVED");
    if (units < 0n || held < 0n || (lot.expiresAt && !Number.isFinite(lot.expiresAt.getTime()))) {
      throw new CreditAccountingInvariantError("INVALID_CREDIT_LOT");
    }
    reserved += held; // reservations may be held on now-expired lots
    if (lot.expiresAt && lot.expiresAt <= now) continue;
    if (lot.kind === "subscription") subscription += units;
    else purchased += units;
  }
  projectCreditAccount({domain:CREDIT_DOMAINS.builder,
    available:subscription + purchased, reserved});
  return {subscriptionAvailableUnits:subscription.toString(),
    purchasedAvailableUnits:purchased.toString(),reservedUnits:reserved.toString()} as const;
}

/** Exact idempotency parity, scoped by writer's selected immutable fields. */
export function sameCreditEventFields(
  previous: object,
  expected: object,
  keys: readonly string[],
): boolean {
  if (!keys.length || new Set(keys).size !== keys.length) {
    throw new CreditAccountingInvariantError("INVALID_EVENT_FIELD_SET");
  }
  const a = previous as Record<string, unknown>;
  const b = expected as Record<string, unknown>;
  return keys.every(key => (a[key] ?? null) === (b[key] ?? null));
}
