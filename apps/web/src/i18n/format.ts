export function makeNumberFormatter(locale: string) {
  return (value: number, digits = 3) =>
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    }).format(value);
}
