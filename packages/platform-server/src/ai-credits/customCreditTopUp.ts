/** V12J.28A: canonical, pure, fail-closed quote for proposed one-time top-ups.
 * A quote is NOT a payment authorization or permission to issue Stripe sessions.
 * Amount is always integer USD cents; never floating-point money.
 */
export const ZOE_TOP_UP_POLICY = Object.freeze({
  version: "zoebuild-v12j28a-custom-topup-proposal-v1",
  minUsdMinor: 500, maxUsdMinor: 50000,
  ledgerUnitsPerUsdMinor: 1000,
  customerCreditsPerUsdMinor: 1,
  presetsUsdMinor: Object.freeze([500, 1000, 2000, 5000]),
  liveAuthorized: false,
});
export type ZoeTopUpQuote = Readonly<{
  amountUsdMinor: number; customerCredits: number; creditUnits: string; policyVersion: string;
}>;
export function quoteZoeTopUpUsdMinor(value: unknown): ZoeTopUpQuote {
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
      value < ZOE_TOP_UP_POLICY.minUsdMinor || value > ZOE_TOP_UP_POLICY.maxUsdMinor)
    throw new Error("AI_CREDIT_TOPUP_AMOUNT_INVALID");
  return Object.freeze({ amountUsdMinor: value, customerCredits: value,
    creditUnits: String(value * ZOE_TOP_UP_POLICY.ledgerUnitsPerUsdMinor),
    policyVersion: ZOE_TOP_UP_POLICY.version });
}
/** Accept exact decimal dollars with at most two fractional digits. */
export function quoteZoeTopUpDollars(value: unknown): ZoeTopUpQuote {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value))
    throw new Error("AI_CREDIT_TOPUP_AMOUNT_INVALID");
  const [dollars, fractional = ""] = value.split(".");
  const cents = BigInt(dollars!) * 100n + BigInt(fractional.padEnd(2, "0") || "0");
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("AI_CREDIT_TOPUP_AMOUNT_INVALID");
  return quoteZoeTopUpUsdMinor(Number(cents));
}
/** Credit count is whole customer credits, never raw internal ledger units. */
export function quoteZoeTopUpCredits(value: unknown): ZoeTopUpQuote {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value))
    throw new Error("AI_CREDIT_TOPUP_AMOUNT_INVALID");
  const credits = BigInt(value);
  if (credits > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("AI_CREDIT_TOPUP_AMOUNT_INVALID");
  return quoteZoeTopUpUsdMinor(Number(credits));
}

/** Immutable DB discriminator for Stripe inline-price custom top-ups. */
export const ZOE_CUSTOM_TOPUP_MARKER = "zoebuild_custom_topup_v12j28";
