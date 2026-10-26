import "server-only";
import { prisma } from "@/lib/prisma";
import {
  BILLING_CHECKOUT_SESSION_LIFETIME_MS,
  BILLING_CHECKOUT_RETRY_TTL_MS,
  BILLING_CHECKOUT_RESERVATION_TTL_MS,
  reservePlatformBillingCheckout,
  releasePlatformBillingCheckoutReservation,
  type PlatformBillingCheckoutReservationClient,
  type PlatformBillingCheckoutReservationResult,
} from "@zoeskoul/platform-server/billing/platformCheckoutReservation";

export { BILLING_CHECKOUT_SESSION_LIFETIME_MS, BILLING_CHECKOUT_RETRY_TTL_MS, BILLING_CHECKOUT_RESERVATION_TTL_MS };
export type BillingCheckoutReservationClient = PlatformBillingCheckoutReservationClient;
export type BillingCheckoutReservationResult = PlatformBillingCheckoutReservationResult;

/** Zoéskoul adapter over the canonical platform-wide user reservation. */
export async function reserveBillingCheckout(
  userId: string,
  checkoutAttemptId: string,
  options: {client?: BillingCheckoutReservationClient; now?: Date} = {},
): Promise<BillingCheckoutReservationResult> {
  return reservePlatformBillingCheckout(userId, checkoutAttemptId, {
    client: options.client ?? (prisma as unknown as BillingCheckoutReservationClient),
    now: options.now,
  });
}

export async function releaseBillingCheckoutReservation(
  userId: string,
  checkoutAttemptId: string,
  options: {client?: BillingCheckoutReservationClient} = {},
): Promise<boolean> {
  return releasePlatformBillingCheckoutReservation(userId, checkoutAttemptId, {
    client: options.client ?? (prisma as unknown as BillingCheckoutReservationClient),
  });
}
