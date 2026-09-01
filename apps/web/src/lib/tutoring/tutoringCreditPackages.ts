// Transitional presentation helper only.
// Price authority lives in tutoringPricing.ts. These are suggested minute
// buttons, not fixed purchase SKUs and not a wallet/session limit.
import {
  calculateTutoringPrice,
  isValidTutoringMinutes,
} from "@/lib/tutoring/tutoringPricing";

export const SUGGESTED_TUTORING_CREDIT_MINUTES =
  [30, 60, 120] as const;

export function launchTutoringCreditPackagePresentation() {
  return SUGGESTED_TUTORING_CREDIT_MINUTES.map(
    (minutes) => {
      const quote = calculateTutoringPrice(minutes);
      return {
        minutes,
        amountMinor: quote.amountMinor,
        currency: quote.currency,
      };
    },
  );
}

export { isValidTutoringMinutes };
