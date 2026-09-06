export function normalizeEmailValue(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeEmails(
  values: readonly string[],
): string[] {
  return [
    ...new Set(
      values
        .map(normalizeEmailValue)
        .filter(Boolean),
    ),
  ];
}
