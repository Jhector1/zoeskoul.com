export const MIN_TUTORING_MINUTES = 30;
export const TUTORING_MINUTE_INCREMENT = 1;
export const MAX_TUTORING_MINUTES = 12 * 60;

export const TUTORING_RATE_MINOR_PER_MINUTE = 110;
export const TUTORING_CURRENCY = "usd" as const;
export const TUTORING_PRICING_VERSION =
  "flat-usd-110-per-minute-v1" as const;

export type TutoringPriceQuote = {
  minutes: number;
  amountMinor: number;
  currency: typeof TUTORING_CURRENCY;
  rateMinorPerMinute: typeof TUTORING_RATE_MINOR_PER_MINUTE;
  pricingVersion: typeof TUTORING_PRICING_VERSION;
};

export function isValidTutoringMinutes(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= MIN_TUTORING_MINUTES &&
    value <= MAX_TUTORING_MINUTES
  );
}

export function assertValidTutoringMinutes(
  value: unknown,
): asserts value is number {
  if (!isValidTutoringMinutes(value)) {
    throw new Error(
      `Tutoring minutes must be whole minutes between ${MIN_TUTORING_MINUTES} and ${MAX_TUTORING_MINUTES}.`,
    );
  }
}

export function calculateTutoringPrice(
  minutes: number,
): TutoringPriceQuote {
  assertValidTutoringMinutes(minutes);
  const amountMinor =
    minutes * TUTORING_RATE_MINOR_PER_MINUTE;

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Tutoring price calculation overflowed.");
  }

  return {
    minutes,
    amountMinor,
    currency: TUTORING_CURRENCY,
    rateMinorPerMinute:
      TUTORING_RATE_MINOR_PER_MINUTE,
    pricingVersion: TUTORING_PRICING_VERSION,
  };
}

export function tutoringPricingPresentation() {
  return {
    minimumMinutes: MIN_TUTORING_MINUTES,
    incrementMinutes: TUTORING_MINUTE_INCREMENT,
    maximumMinutes: MAX_TUTORING_MINUTES,
    rateMinorPerMinute:
      TUTORING_RATE_MINOR_PER_MINUTE,
    currency: TUTORING_CURRENCY,
    pricingVersion: TUTORING_PRICING_VERSION,
  };
}
