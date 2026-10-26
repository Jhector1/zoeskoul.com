/** Display Stripe minor-unit amounts with currency-appropriate decimal places. */
export function formatBuilderBillingAmount(
  locale: string,
  currency: string,
  amountMinor: number,
): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("Invalid Builder billing amount.");
  }
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  // TypeScript allows this Intl field to be undefined; currency formatters
  // still use their configured minor-unit precision when it is available.
  const options = formatter.resolvedOptions();
  const digits = options.maximumFractionDigits ?? options.minimumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** digits);
}
