/**
 * Canonical PLATFORM subscription customer lifecycle.
 * This module is provider-adapted: no Next.js, Prisma or Stripe SDK ownership.
 * Never use it for a generated storefront's merchant/customer records.
 */
export type PlatformCustomerRecord = Readonly<{
  email: string | null;
  stripeCustomerId: string | null;
}>;

export type PlatformStripeCustomerDeps = Readonly<{
  findUser: (userId: string) => Promise<PlatformCustomerRecord | null>;
  setCustomerId: (userId: string, customerId: string | null) => Promise<unknown>;
  retrieveCustomer: (customerId: string) => Promise<unknown>;
  createCustomer: (userId: string, email: string | null) => Promise<Readonly<{ id: string }>>;
}>;

export function isMissingPlatformStripeCustomerError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "resource_missing" ||
    (typeof candidate.message === "string" && candidate.message.includes("No such customer"));
}

function isDeletedCustomer(value: unknown): boolean {
  return value !== null && typeof value === "object" &&
    "deleted" in value && (value as { deleted: unknown }).deleted === true;
}

function normalizedUserId(raw: string): string {
  const userId = raw.trim();
  if (!userId) throw new Error("Platform billing requires an authenticated user ID.");
  return userId;
}

/**
 * Verify a stored platform customer before reusing it. Recovery happens only
 * for a proven deleted/missing Stripe customer, never network/auth failures.
 */
export async function getOrCreatePlatformStripeCustomerId(input: Readonly<{
  userId: string;
  deps: PlatformStripeCustomerDeps;
}>): Promise<string> {
  const userId = normalizedUserId(input.userId);
  const { deps } = input;
  const user = await deps.findUser(userId);
  if (!user) throw new Error("Platform billing user not found.");

  if (user.stripeCustomerId) {
    try {
      const customer = await deps.retrieveCustomer(user.stripeCustomerId);
      if (isDeletedCustomer(customer)) {
        await deps.setCustomerId(userId, null);
      } else {
        return user.stripeCustomerId;
      }
    } catch (error: unknown) {
      if (!isMissingPlatformStripeCustomerError(error)) throw error;
      await deps.setCustomerId(userId, null);
    }
  }

  const created = await deps.createCustomer(userId, user.email);
  if (!created.id) throw new Error("Stripe did not return a customer ID.");
  await deps.setCustomerId(userId, created.id);
  return created.id;
}

/** Retry once only after Stripe confirms a missing `customer` parameter. */
export async function withValidPlatformStripeCustomer<T>(input: Readonly<{
  userId: string;
  deps: PlatformStripeCustomerDeps;
  operate: (customerId: string) => Promise<T>;
}>): Promise<T> {
  const userId = normalizedUserId(input.userId);
  const customerId = await getOrCreatePlatformStripeCustomerId({ userId, deps: input.deps });
  try {
    return await input.operate(customerId);
  } catch (error: unknown) {
    const param = error && typeof error === "object" && "param" in error
      ? (error as { param?: unknown }).param : undefined;
    if (!isMissingPlatformStripeCustomerError(error) || param !== "customer") throw error;
    await input.deps.setCustomerId(userId, null);
    const newCustomerId = await getOrCreatePlatformStripeCustomerId({ userId, deps: input.deps });
    return input.operate(newCustomerId);
  }
}
