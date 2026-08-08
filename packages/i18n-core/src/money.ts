/**
 * Maps ZoeSkoul application locale identifiers to Intl locales.
 */
export function toIntlLocale(
  appLocale: string,
): string {
  if (appLocale === "en") return "en-US";
  if (appLocale === "fr") return "fr-FR";
  if (appLocale === "ht") return "ht-HT";
  return appLocale;
}

/**
 * Formats a currency amount supplied in minor units.
 *
 * The currency's resolved fraction digits determine how the
 * minor-unit integer is converted to its major-unit value.
 */
export function formatMoneyMinor(
  amountMinor: number,
  currency: string,
  intlLocale: string,
): string {
  const cur = currency.toUpperCase();

  const probe = new Intl.NumberFormat(
    intlLocale,
    {
      style: "currency",
      currency: cur,
    },
  );

  const opts = probe.resolvedOptions();

  const digits =
    typeof opts.maximumFractionDigits === "number"
      ? opts.maximumFractionDigits
      : 2;

  const value =
    amountMinor / Math.pow(10, digits);

  return new Intl.NumberFormat(
    intlLocale,
    {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    },
  ).format(value);
}
