/** Shared, durable platform Checkout reservation. One reservation per user
 * is deliberate: Zoéskoul and ZoeBuild use the same platform Stripe customer.
 * No Stripe SDK, Prisma client, Next.js, merchant payments, or test-mode branches.
 */

export const BILLING_CHECKOUT_SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const BILLING_CHECKOUT_RETRY_TTL_MS = 80 * 60 * 1000;
export const BILLING_CHECKOUT_RESERVATION_TTL_MS = 130 * 60 * 1000;

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isPlatformCheckoutAttemptId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_RE.test(value.trim());
}

type BillingReservationRow = {
  billingCheckoutAttemptId: string | null;
  billingCheckoutReservedAt: Date | null;
};

export type PlatformBillingCheckoutReservationClient = {
  user: {
    findUnique(args: {
      where: { id: string };
      select: {
        billingCheckoutAttemptId: true;
        billingCheckoutReservedAt: true;
      };
    }): Promise<BillingReservationRow | null>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
};

export type PlatformBillingCheckoutReservationResult =
  | {
      kind: "reserved";
      reservedAt: Date;
      reused: boolean;
    }
  | { kind: "conflict"; reservedAt: Date; checkoutAttemptId: string }
  | { kind: "stale_attempt"; reservedAt: Date }
  | { kind: "missing_user" };

export async function reservePlatformBillingCheckout(
  userId: string,
  checkoutAttemptId: string,
  options: {
    client: PlatformBillingCheckoutReservationClient;
    now?: Date;
  },
): Promise<PlatformBillingCheckoutReservationResult> {
  if (!isPlatformCheckoutAttemptId(checkoutAttemptId)) {
    throw new Error("Invalid Checkout attempt id");
  }

  const client = options.client;
  const now = options.now ?? new Date();

  for (let pass = 0; pass < 4; pass += 1) {
    const current = await client.user.findUnique({
      where: { id: userId },
      select: {
        billingCheckoutAttemptId: true,
        billingCheckoutReservedAt: true,
      },
    });

    if (!current) return { kind: "missing_user" };

    const currentAttemptId = current.billingCheckoutAttemptId;
    const currentReservedAt = current.billingCheckoutReservedAt;

    if (currentAttemptId && currentReservedAt) {
      const ageMs = Math.max(
        0,
        now.getTime() - currentReservedAt.getTime(),
      );

      if (currentAttemptId === checkoutAttemptId) {
        if (ageMs <= BILLING_CHECKOUT_RETRY_TTL_MS) {
          return {
            kind: "reserved",
            reservedAt: currentReservedAt,
            reused: true,
          };
        }

        return {
          kind: "stale_attempt",
          reservedAt: currentReservedAt,
        };
      }

      if (ageMs <= BILLING_CHECKOUT_RESERVATION_TTL_MS) {
        return {
          kind: "conflict",
          reservedAt: currentReservedAt,
          checkoutAttemptId: currentAttemptId,
        };
      }
    }

    const priorAttemptId = currentAttemptId ?? null;
    const priorReservedAt = currentReservedAt ?? null;

    const updated = await client.user.updateMany({
      where: {
        id: userId,
        billingCheckoutAttemptId: priorAttemptId,
        billingCheckoutReservedAt: priorReservedAt,
      },
      data: {
        billingCheckoutAttemptId: checkoutAttemptId,
        billingCheckoutReservedAt: now,
      },
    });

    if (updated.count === 1) {
      return {
        kind: "reserved",
        reservedAt: now,
        reused: false,
      };
    }
  }

  throw new Error("Could not reserve billing Checkout atomically");
}

export async function releasePlatformBillingCheckoutReservation(
  userId: string,
  checkoutAttemptId: string,
  options: { client: PlatformBillingCheckoutReservationClient },
): Promise<boolean> {
  if (!isPlatformCheckoutAttemptId(checkoutAttemptId)) return false;

  const client = options.client;
  const updated = await client.user.updateMany({
    where: {
      id: userId,
      billingCheckoutAttemptId: checkoutAttemptId,
    },
    data: {
      billingCheckoutAttemptId: null,
      billingCheckoutReservedAt: null,
    },
  });

  return updated.count === 1;
}
